import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";

export async function listTreatments(env: Env): Promise<Response> {
  const admin = adminClient(env);
  const { data, error } = await admin
    .from("treatments")
    .select("id, name, is_tint, is_eyelash, uses_adhesive, requires_patch_test, display_order")
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return json({ treatments: data });
}
