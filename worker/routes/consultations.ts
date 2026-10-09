import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { consultationSubmissionSchema, validateAnswerCompleteness, finalizeConsultationSchema } from "../lib/validation";
import { recordAuditEvent } from "../lib/audit";
import { screenConsultation } from "../../shared/ruleEngine";
import { ALL_QUESTIONS } from "../../shared/questions";
import { DECLARATION_TEXT, DECLARATIONS_VERSION, requiredDeclarations, type DeclarationKey } from "../../shared/declarations";
import type { TreatmentRuleRecord } from "../../shared/types";

const QUESTION_META = new Map(ALL_QUESTIONS.map((q) => [q.key, { section: q.section, label: q.label }]));

type FlagRow = {
  id: string;
  rule_key: string;
  group_key: string | null;
  category: string | null;
  severity: "HIGH" | "MEDIUM" | "INFORMATION";
  title: string;
  client_answer_summary: string;
  explanation: string;
  staff_action: string;
  client_message: string | null;
  outcome: "warn" | "doctor" | "stop";
  treatment_ids: string[];
};

// Phase 1: client info + answers + treatments -> screening runs -> flags are
// returned to the client so they can be shown BEFORE any signature exists.
// This does not finalize the consultation; see finalizeConsultation below.
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

  // The client picks from the service list; each service maps to the
  // screening treatment its rules run against. Never trust client-supplied
  // names/flags — both are looked up here.
  const serviceIds = [...new Set(submission.service_ids ?? [])];
  const servicesByTreatment = new Map<string, string[]>();
  if (serviceIds.length > 0) {
    const { data: picked, error: pickedError } = await admin
      .from("services")
      .select("id, treatment_id, extra_treatment_ids")
      .in("id", serviceIds)
      .eq("active", true)
      .not("treatment_id", "is", null);
    if (pickedError) return errorResponse(pickedError.message, 500);
    if ((picked ?? []).length !== serviceIds.length) {
      return errorResponse("One or more selected treatments are invalid or unavailable");
    }
    // A combined service (e.g. henna brows + regular lash tint) is screened
    // against every treatment it involves.
    for (const s of picked ?? []) {
      for (const treatmentId of [s.treatment_id as string, ...((s.extra_treatment_ids as string[] | null) ?? [])]) {
        const list = servicesByTreatment.get(treatmentId) ?? [];
        list.push(s.id);
        servicesByTreatment.set(treatmentId, list);
      }
    }
  }
  const treatmentIds = [...new Set([...(submission.treatment_ids ?? []), ...servicesByTreatment.keys()])];

  const { data: treatments, error: treatmentsError } = await admin
    .from("treatments")
    .select(
      "id, name, is_tint, is_eyelash, uses_adhesive, uses_latex, requires_patch_test, contains_ppd, is_henna, is_lift, is_lamination, is_wax, is_gel"
    )
    .in("id", treatmentIds)
    .eq("active", true);

  if (treatmentsError) return errorResponse(treatmentsError.message, 500);
  if (!treatments || treatments.length !== treatmentIds.length) {
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
    // Never overwrite a known client's details from a public form (anyone
    // could type their email); only fill in an address we don't have yet.
    if (submission.client.address) {
      await admin.from("clients").update({ address: submission.client.address }).eq("id", clientId).is("address", null);
    }
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
      guardian_name: submission.guardian?.name ?? null,
      guardian_relationship: submission.guardian?.relationship ?? null,
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
    treatmentIds.map((treatment_id) => ({
      consultation_id: consultationId,
      treatment_id,
      service_ids: servicesByTreatment.get(treatment_id) ?? [],
    }))
  );
  if (servicesError) return errorResponse(servicesError.message, 500);

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

  // Age isn't a question: a guardian filling the form in means under 16.
  const screeningAnswers = [...submission.answers, { question_key: "under_16", answer_value: !!submission.guardian }];
  const result = screenConsultation(screeningAnswers, treatments, (rules ?? []) as unknown as TreatmentRuleRecord[]);

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
        category: "Treatment coverage",
        severity: "INFORMATION",
        outcome: "warn",
        title: "New treatment not previously covered",
        client_answer_summary: `Requested: ${newlyRequested.map((t) => t.name).join(", ")}`,
        explanation:
          "This treatment was not included in the client's most recent consultation, so it hasn't been screened before.",
        staff_action: "Go through this treatment with the client before starting.",
        client_message: `You haven't had ${newlyRequested.map((t) => t.name).join(", ")} with us before. Your therapist will run through it with you before starting.`,
        treatment_ids: newlyRequested.map((t) => t.id),
      });
      result.summary.total += 1;
      result.summary.information += 1;
    }
  }

  let insertedFlags: FlagRow[] = [];
  if (result.flags.length > 0) {
    const { data: flagsData, error: flagsError } = await admin
      .from("consultation_flags")
      .insert(
        result.flags.map((f) => ({
          consultation_id: consultationId,
          rule_id: f.rule_id,
          rule_key: f.rule_key,
          group_key: f.group_key,
          category: f.category,
          severity: f.severity,
          title: f.title,
          client_answer_summary: f.client_answer_summary,
          explanation: f.explanation,
          staff_action: f.staff_action,
          client_message: f.client_message,
          outcome: f.outcome,
          treatment_ids: f.treatment_ids,
        }))
      )
      .select(
        "id, rule_key, group_key, category, severity, title, client_answer_summary, explanation, staff_action, client_message, outcome, treatment_ids"
      );
    if (flagsError) return errorResponse(flagsError.message, 500);
    insertedFlags = (flagsData ?? []) as FlagRow[];

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
    .update({ status: "screening_complete", screened_at: screenedAt })
    .eq("id", consultationId);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "system",
    event_type: "screening_completed",
    metadata: { summary: result.summary },
  });

  // The flags become visible to the client in this very response -- log that
  // they were shown, distinct from them being generated.
  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "system",
    event_type: "flag_displayed_to_client",
    metadata: { flag_ids: insertedFlags.map((f) => f.id) },
  });

  return json(
    {
      consultation_id: consultationId,
      access_token: consultation.access_token,
      status: "screening_complete",
      flags: insertedFlags,
      treatments: treatments.map((t) => ({ id: t.id, name: t.name })),
    },
    201
  );
}

// Phase 2: the client has seen the flags from phase 1, acknowledges them,
// decides whether to continue, and signs. This locks the consultation --
// the acknowledgement does not change or remove any staff-facing requirement
// (e.g. a missing patch test is still missing regardless of the decision).
export async function finalizeConsultation(request: Request, env: Env, consultationId: string): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return errorResponse("Missing token", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const parsed = finalizeConsultationSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;

  const admin = adminClient(env);
  const { data: consultation, error } = await admin
    .from("consultations")
    .select("id, access_token, status, locked_at, guardian_name")
    .eq("id", consultationId)
    .maybeSingle();

  if (error || !consultation || consultation.access_token !== token) {
    return errorResponse("Not found", 404);
  }
  if (consultation.locked_at) {
    return errorResponse("This consultation has already been signed and locked", 409);
  }
  if (consultation.status !== "screening_complete") {
    return errorResponse("This consultation is not ready to be finalized", 409);
  }

  const { data: flags, error: flagsError } = await admin
    .from("consultation_flags")
    .select(
      "id, rule_key, title, severity, category, client_answer_summary, explanation, staff_action, client_message, outcome, treatment_ids"
    )
    .eq("consultation_id", consultationId);
  if (flagsError) return errorResponse(flagsError.message, 500);

  // The client's own statements are what put responsibility for undisclosed
  // information and informed risks on them, so they're required, not optional.
  const required = requiredDeclarations({
    decision: input.decision,
    doctorFlagged: (flags ?? []).some((f) => f.outcome === "doctor"),
    hasGuardian: !!consultation.guardian_name,
  });
  const ticked = new Set(input.declarations);
  if (required.some((k) => !ticked.has(k))) {
    return errorResponse("Please tick every statement before signing");
  }
  const declarations = {
    version: DECLARATIONS_VERSION,
    statements: required.map((key: DeclarationKey) => ({ key, text: DECLARATION_TEXT[key] })),
  };

  const allFlagIds = new Set((flags ?? []).map((f) => f.id));
  const acknowledgedSet = new Set(input.acknowledged_flag_ids);
  const missingAcknowledgement = [...allFlagIds].filter((id) => !acknowledgedSet.has(id));
  if (missingAcknowledgement.length > 0) {
    return errorResponse("All identified attention items must be acknowledged before continuing");
  }
  const unknownFlagIds = input.acknowledged_flag_ids.filter((id) => !allFlagIds.has(id));
  if (unknownFlagIds.length > 0) {
    return errorResponse("Acknowledgement references a flag that does not belong to this consultation");
  }

  const explanationSnapshot = flags ?? [];

  const { error: ackError } = await admin.from("consultation_acknowledgements").insert({
    consultation_id: consultationId,
    flag_ids: input.acknowledged_flag_ids,
    explanation_snapshot: explanationSnapshot,
    client_decision: input.decision,
    declarations,
    device_info: input.device_info ?? null,
  });
  if (ackError) return errorResponse(ackError.message, 500);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "client",
    event_type: "client_acknowledgement_accepted",
    metadata: { flag_ids: input.acknowledged_flag_ids },
  });
  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "client",
    event_type: "client_decision_recorded",
    metadata: { decision: input.decision },
  });

  // Pre-existing column. Patch tests can no longer be waived (a missing one
  // is a "stop" flag), so this is always false for new consultations.
  const consentWithoutPatchTest = false;

  const { error: signatureError } = await admin.from("signatures").insert({
    consultation_id: consultationId,
    method: "drawn",
    legal_name: input.signature.legal_name,
    signature_value: input.signature.signature_value,
    is_provisional: true,
    consent_without_patch_test: consentWithoutPatchTest,
    device_info: input.device_info ?? null,
  });
  if (signatureError) return errorResponse(signatureError.message, 500);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "client",
    event_type: "electronic_signature_captured",
    metadata: { method: "drawn" },
  });

  const lockedAt = new Date().toISOString();
  const newStatus = input.decision === "decline" ? "held" : "pending_review";
  await admin.from("consultations").update({ status: newStatus, locked_at: lockedAt }).eq("id", consultationId);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "system",
    event_type: "consultation_locked",
    metadata: { decision: input.decision },
  });
  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: null,
    actor_type: "client",
    event_type: "consultation_completed",
  });

  return json({ consultation_id: consultationId, status: newStatus, locked: true });
}

export async function getClientConsultation(request: Request, env: Env, consultationId: string): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return errorResponse("Missing token", 401);

  const admin = adminClient(env);
  const { data: consultation, error } = await admin
    .from("consultations")
    .select("id, status, access_token, submitted_at, locked_at, created_at")
    .eq("id", consultationId)
    .maybeSingle();

  // Same response whether not-found or token mismatch — don't leak existence.
  if (error || !consultation || consultation.access_token !== token) {
    return errorResponse("Not found", 404);
  }

  const [{ data: answers }, { data: services }, { data: signature }, { data: flags }, { data: acknowledgement }] =
    await Promise.all([
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
      admin
        .from("consultation_flags")
        .select(
          "id, rule_key, group_key, category, severity, title, client_answer_summary, explanation, staff_action, client_message, outcome, treatment_ids"
        )
        .eq("consultation_id", consultationId),
      admin
        .from("consultation_acknowledgements")
        .select("client_decision, acknowledged_at")
        .eq("consultation_id", consultationId)
        .maybeSingle(),
    ]);

  return json({
    id: consultation.id,
    status: consultation.status,
    locked: !!consultation.locked_at,
    submitted_at: consultation.submitted_at,
    answers,
    treatments: ((services ?? []) as unknown as { treatments: { id: string; name: string } | null }[]).map(
      (s) => s.treatments
    ),
    signature,
    flags: flags ?? [],
    acknowledgement,
  });
}
