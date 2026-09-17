import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { requireStaff, AuthError } from "../lib/auth";
import { staffReviewSchema } from "../lib/validation";
import { recordAuditEvent } from "../lib/audit";
import type { Severity } from "../../shared/types";

const SEVERITY_RANK: Record<Severity, number> = { HIGH: 3, MEDIUM: 2, INFORMATION: 1 };

function highestSeverity(severities: Severity[]): Severity | null {
  if (severities.length === 0) return null;
  return severities.reduce((a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a));
}

const DECISION_TO_STATUS: Record<string, string> = {
  suitable_to_proceed: "reviewed",
  proceed_with_conditions: "reviewed",
  further_information_required: "follow_up_required",
  do_not_proceed: "held",
};

const NOTES_REQUIRED_FOR = new Set([
  "proceed_with_conditions",
  "further_information_required",
  "do_not_proceed",
]);

export async function listStaffConsultations(request: Request, env: Env): Promise<Response> {
  try {
    await requireStaff(request, env);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    throw e;
  }

  const admin = adminClient(env);
  const { data, error } = await admin
    .from("consultations")
    .select(
      `id, status, submitted_at, version,
       clients(first_name, last_name),
       consultation_services(treatments(name)),
       consultation_flags(severity),
       staff_reviews(decision, decided_at)`
    )
    .neq("status", "draft")
    .order("submitted_at", { ascending: false });

  if (error) return errorResponse(error.message, 500);

  type Row = {
    id: string;
    status: string;
    submitted_at: string | null;
    version: number;
    clients: { first_name: string; last_name: string } | null;
    consultation_services: { treatments: { name: string } | null }[];
    consultation_flags: { severity: Severity }[];
    staff_reviews: { decision: string; decided_at: string }[];
  };

  const rows = ((data ?? []) as unknown as Row[]).map((c) => {
    const latestReview = [...c.staff_reviews].sort((a, b) => b.decided_at.localeCompare(a.decided_at))[0];
    return {
      id: c.id,
      client_name: c.clients ? `${c.clients.first_name} ${c.clients.last_name}` : "Unknown client",
      treatments: c.consultation_services.map((s) => s.treatments?.name).filter(Boolean),
      submitted_at: c.submitted_at,
      status: c.status,
      flag_count: c.consultation_flags.length,
      highest_severity: highestSeverity(c.consultation_flags.map((f) => f.severity)),
      latest_staff_decision: latestReview?.decision ?? null,
    };
  });

  return json({ consultations: rows });
}

export async function getStaffConsultation(request: Request, env: Env, consultationId: string): Promise<Response> {
  let staff;
  try {
    staff = await requireStaff(request, env);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    throw e;
  }

  const admin = adminClient(env);
  const { data: consultation, error } = await admin
    .from("consultations")
    .select(
      `id, status, version, submitted_at, screened_at, reviewed_at,
       clients(id, first_name, last_name, email, phone, address)`
    )
    .eq("id", consultationId)
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);
  if (!consultation) return errorResponse("Not found", 404);

  const [{ data: answers }, { data: services }, { data: flags }, { data: signature }, { data: reviews }] =
    await Promise.all([
      admin
        .from("consultation_answers")
        .select("section, question_key, question_label, answer_value, additional_info")
        .eq("consultation_id", consultationId)
        .order("section"),
      admin.from("consultation_services").select("treatments(id, name)").eq("consultation_id", consultationId),
      admin
        .from("consultation_flags")
        .select("id, severity, title, client_answer_summary, explanation, staff_action, created_at")
        .eq("consultation_id", consultationId)
        .order("severity"),
      admin
        .from("signatures")
        .select("legal_name, signature_value, method, is_provisional, consent_without_patch_test, signed_at")
        .eq("consultation_id", consultationId)
        .maybeSingle(),
      admin
        .from("staff_reviews")
        .select("id, staff_id, decision, notes, decided_at, consultation_version, staff_profiles(full_name)")
        .eq("consultation_id", consultationId)
        .order("decided_at", { ascending: false }),
    ]);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: staff.id,
    actor_type: "staff",
    event_type: "consultation_opened_by_staff",
  });

  return json({
    ...consultation,
    treatments: ((services ?? []) as unknown as { treatments: { id: string; name: string } | null }[]).map(
      (s) => s.treatments
    ),
    answers,
    flags,
    signature,
    staff_reviews: reviews,
  });
}

export async function recordStaffReview(request: Request, env: Env, consultationId: string): Promise<Response> {
  let staff;
  try {
    staff = await requireStaff(request, env);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    throw e;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const parsed = staffReviewSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const { decision, notes } = parsed.data;

  if (NOTES_REQUIRED_FOR.has(decision) && !notes) {
    return errorResponse(`Notes are required for decision "${decision}"`);
  }

  const admin = adminClient(env);
  const { data: consultation, error: fetchError } = await admin
    .from("consultations")
    .select("id, version")
    .eq("id", consultationId)
    .maybeSingle();
  if (fetchError) return errorResponse(fetchError.message, 500);
  if (!consultation) return errorResponse("Not found", 404);

  const { data: review, error: reviewError } = await admin
    .from("staff_reviews")
    .insert({
      consultation_id: consultationId,
      staff_id: staff.id,
      decision,
      notes: notes ?? null,
      consultation_version: consultation.version,
    })
    .select("id, decision, notes, decided_at")
    .single();
  if (reviewError || !review) return errorResponse(reviewError?.message ?? "Could not record review", 500);

  const newStatus = DECISION_TO_STATUS[decision] ?? "reviewed";
  await admin
    .from("consultations")
    .update({ status: newStatus, reviewed_at: new Date().toISOString() })
    .eq("id", consultationId);

  await recordAuditEvent(admin, {
    consultation_id: consultationId,
    actor_id: staff.id,
    actor_type: "staff",
    event_type: "staff_decision_recorded",
    metadata: { decision, review_id: review.id },
  });

  return json({ review, status: newStatus }, 201);
}
