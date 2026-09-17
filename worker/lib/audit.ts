import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordAuditEvent(
  admin: SupabaseClient,
  params: {
    consultation_id: string | null;
    actor_id: string | null;
    actor_type: "client" | "staff" | "system";
    event_type: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    consultation_id: params.consultation_id,
    actor_id: params.actor_id,
    actor_type: params.actor_type,
    event_type: params.event_type,
    metadata: params.metadata ?? {},
  });
  // Audit failures must never silently vanish; surface loudly server-side.
  if (error) console.error("audit_log insert failed", params.event_type, error);
}
