import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { consultationSubmissionSchema, validateAnswerCompleteness } from "../lib/validation";
import { recordAuditEvent } from "../lib/audit";
import { screenConsultation } from "../../shared/ruleEngine";
import { ALL_QUESTIONS } from "../../shared/questions";
import type { TreatmentRuleRecord } from "../../shared/types";

const QUESTION_META = new Map(ALL_QUESTIONS.map((q) => [q.key, { section: q.section, label: q.label }]));

export async function submitConsultation(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const parsed = consultationSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const submission = parsed.data;

  const completeness = validateAnswerCompleteness(submission.answers);
  if (completeness) return errorResponse(completeness);

  const admin = adminClient(env);
  const email = submission.client.email.toLowerCase();

  // Selected treatments must exist and be active — never trust client-supplied names/flags.
  const { data: treatments, error: treatmentsError } = await admin
    .from("treatments")
    .select("id, name, is_tint, is_eyelash, uses_adhesive, requires_patch_test")
    .in("id", submission.treatment_ids)
    .eq("active", true);

  if (treatmentsError) return errorResponse(treatmentsError.message, 500);
  if (!treatments || treatments.length !== submission.treatment_ids.length) {
    return errorResponse("One or more selected treatments are invalid or unavailable");
  }

  // Reuse an existing client record by email (repeat visits), otherwise create one.
  const { data: existingClient } = await admin.from("clients").select("id").eq("email", email).maybeSingle();

  let clientId: string;
  let priorConsultation: { id: string; version: number; valid_until: string | null } | null = null;
  let priorTreatmentIds = new Set<string>();

  if (existingClient) {
    const { data: prior } = await admin
      .from("consultations")
      .select("id, version, valid_until")
      .eq("client_id", existingClient.id)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) {
      priorConsultation = prior;
      const { data: priorServices } = await admin
        .from("consultation_services")
        .select("treatment_id")
        .eq("consultation_id", prior.id);
      priorTreatmentIds = new Set((priorServices ?? []).map((s) => s.treatment_id));
    }
  }

  if (existingClient) {
    clientId = existingClient.id;
    await admin
      .from("clients")
      .update({
        first_name: submission.client.first_name,
        last_name: submission.client.last_name,
        phone: submission.client.phone,
        address: submission.client.address ?? null,
      })
      .eq("id", clientId);
  } else {
    const { data: newClient, error: clientError } = await admin
      .from("clients")
      .insert({
        first_name: submission.client.first_name,
        last_name: submission.client.last_name,
        email,
        phone: submission.client.phone,
        address: submission.client.address ?? null,
      })
      .select("id")
      .single();
    if (clientError || !newClient) return errorResponse(clientError?.message ?? "Could not create client", 500);
    clientId = newClient.id;
  }

  const { data: consultation, error: consultationError } = await admin
    .from("consultations")
    .insert({
      client_id: clientId,
      status: "draft",
      version: priorConsultation ? priorConsultation.version + 1 : 1,
      supersedes_consultation_id: priorConsultation?.id ?? null,
    })
    .select("id, access_token, version")
    .single();
  if (consultationError || !consultation) {
    return errorResponse(consultationError?.message ?? "Could not create consultation", 500);
  }
  const consultationId = consultation.id;

  if (priorConsultation) {
    await recordAuditEvent(admin, {
      consultation_id: consultationId,
      actor_id: null,
      actor_type: "system",
      event_type: "consultation_version_created",
      metadata: { supersedes_consultation_id: priorConsultation.id, version: consultation.version },
    });
  }

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "client",
    event_type: "consultation_started",
  });

  const answerRows = submission.answers.map((a) => {
    const meta = QUESTION_META.get(a.question_key);
    if (!meta) throw new Error(`Unknown question key survived validation: ${a.question_key}`);
    return {
      consultation_id: consultationId,
      section: meta.section,
      question_key: a.question_key,
      question_label: meta.label,
      answer_value: a.answer_value,
      additional_info: a.additional_info ?? null,
    };
  });
  const { error: answersError } = await admin.from("consultation_answers").insert(answerRows);
  if (answersError) return errorResponse(answersError.message, 500);

  const { error: servicesError } = await admin.from("consultation_services").insert(
    submission.treatment_ids.map((treatment_id) => ({ consultation_id: consultationId, treatment_id }))
  );
  if (servicesError) return errorResponse(servicesError.message, 500);

  const { error: signatureError } = await admin.from("signatures").insert({
    consultation_id: consultationId,
    method: "typed",
    legal_name: submission.signature.legal_name,
    signature_value: submission.signature.signature_value,
    is_provisional: true,
    consent_without_patch_test: submission.signature.consent_without_patch_test,
  });
  if (signatureError) return errorResponse(signatureError.message, 500);

  const { data: validitySetting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "consultation_validity_months")
    .maybeSingle();
  const validityMonths = typeof validitySetting?.value === "number" ? validitySetting.value : 6;

  const submittedAt = new Date();
  const validUntil = new Date(submittedAt);
  validUntil.setMonth(validUntil.getMonth() + validityMonths);

  await admin
    .from("consultations")
    .update({ status: "submitted", submitted_at: submittedAt.toISOString(), valid_until: validUntil.toISOString() })
    .eq("id", consultationId);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "client",
    event_type: "consultation_submitted",
  });

  // --- Automated screening ---
  const { data: rules, error: rulesError } = await admin
    .from("treatment_rules")
    .select("*")
    .eq("active", true);
  if (rulesError) return errorResponse(rulesError.message, 500);

  const result = screenConsultation(
    submission.answers,
    treatments,
    submission.signature,
    (rules ?? []) as unknown as TreatmentRuleRecord[]
  );

  // New-treatment-not-covered: a treatment requested now that wasn't part of
  // the client's most recent still-valid consultation. Being "less than N
  // months old" doesn't mean every treatment in it was actually screened --
  // per-treatment coverage is checked independently of time-validity.
  const priorStillValid = priorConsultation?.valid_until && new Date(priorConsultation.valid_until) > submittedAt;
  if (priorStillValid) {
    const newlyRequested = treatments.filter((t) => !priorTreatmentIds.has(t.id));
    if (newlyRequested.length > 0) {
      result.flags.push({
        rule_id: null,
        rule_key: "new_treatment_not_covered",
        group_key: null,
        severity: "INFORMATION",
        title: "New treatment not previously covered",
        client_answer_summary: `Requested: ${newlyRequested.map((t) => t.name).join(", ")}`,
        explanation:
          "This treatment was not included in the client's most recent consultation and has not been previously screened, even though that consultation is still within its validity period. Final treatment suitability remains a staff decision.",
        staff_action: "Confirm this treatment has been reviewed before proceeding.",
        treatment_ids: newlyRequested.map((t) => t.id),
      });
      result.summary.total += 1;
      result.summary.information += 1;
    }
  }

  if (result.flags.length > 0) {
    const { error: flagsError } = await admin.from("consultation_flags").insert(
      result.flags.map((f) => ({
        consultation_id: consultationId,
        rule_id: f.rule_id,
        rule_key: f.rule_key,
        group_key: f.group_key,
        severity: f.severity,
        title: f.title,
        client_answer_summary: f.client_answer_summary,
        explanation: f.explanation,
        staff_action: f.staff_action,
        treatment_ids: f.treatment_ids,
      }))
    );
    if (flagsError) return errorResponse(flagsError.message, 500);

    for (const flag of result.flags) {
      await recordAuditEvent(admin, {
        consultation_id: consultationId,
        actor_id: null,
        actor_type: "system",
        event_type: "flag_created",
        metadata: { rule_key: flag.rule_key, severity: flag.severity },
      });
    }
  }

  const screenedAt = new Date().toISOString();
  await admin
    .from("consultations")
    .update({ status: "pending_review", screened_at: screenedAt })
    .eq("id", consultationId);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "system",
    event_type: "screening_completed",
    metadata: { summary: result.summary },
  });

  return json(
    {
      consultation_id: consultationId,
      access_token: consultation.access_token,
      status: "pending_review",
    },
    201
  );
}

export async function getClientConsultation(request: Request, env: Env, consultationId: string): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return errorResponse("Missing token", 401);

  const admin = adminClient(env);
  const { data: consultation, error } = await admin
    .from("consultations")
    .select("id, status, access_token, submitted_at, created_at")
    .eq("id", consultationId)
    .maybeSingle();

  // Same response whether not-found or token mismatch — don't leak existence.
  if (error || !consultation || consultation.access_token !== token) {
    return errorResponse("Not found", 404);
  }

  const [{ data: answers }, { data: services }, { data: signature }] = await Promise.all([
    admin
      .from("consultation_answers")
      .select("question_key, question_label, answer_value, additional_info")
      .eq("consultation_id", consultationId),
    admin
      .from("consultation_services")
      .select("treatments(id, name)")
      .eq("consultation_id", consultationId),
    admin
      .from("signatures")
      .select("legal_name, signed_at, is_provisional")
      .eq("consultation_id", consultationId)
      .maybeSingle(),
  ]);

  return json({
    id: consultation.id,
    status: consultation.status,
    submitted_at: consultation.submitted_at,
    answers,
    treatments: ((services ?? []) as unknown as { treatments: { id: string; name: string } | null }[]).map(
      (s) => s.treatments
    ),
    signature,
  });
}
