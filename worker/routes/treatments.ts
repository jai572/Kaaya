import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";

// The consultation's treatment list: every active service that maps to a
// screening treatment. Retail products and placeholders have no
// treatment_id, so they never appear here.
export async function listTreatments(env: Env): Promise<Response> {
  const admin = adminClient(env);
  const [treatmentsRes, servicesRes] = await Promise.all([
    admin
      .from("treatments")
      .select("id, name, is_tint, is_eyelash, uses_adhesive, uses_latex, requires_patch_test, display_order")
      .eq("active", true)
      .order("display_order", { ascending: true }),
    admin
      .from("services")
      .select("id, name, category_slug, treatment_id, display_order")
      .eq("active", true)
      .not("treatment_id", "is", null)
      .order("category_slug", { ascending: true })
      .order("display_order", { ascending: true }),
  ]);

  if (treatmentsRes.error) return errorResponse(treatmentsRes.error.message, 500);
  if (servicesRes.error) return errorResponse(servicesRes.error.message, 500);
  const activeTreatmentIds = new Set((treatmentsRes.data ?? []).map((t) => t.id));
  return json({
    treatments: treatmentsRes.data,
    services: (servicesRes.data ?? []).filter((s) => activeTreatmentIds.has(s.treatment_id as string)),
  });
}
