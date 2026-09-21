import type { Env } from "../env";
import { json, errorResponse } from "../lib/http";
import { getSquareClient, SquareApiError } from "../lib/square";
import { adminClient } from "../lib/supabase";

// Square is the live source of truth here — this only decorates Square's
// own bookable services with whichever Kaaya screening treatment (if any)
// staff have mapped them to via /staff/service-mappings. Never caches price
// or duration as authoritative beyond the short edge-cache TTL below.
export async function listBookableServices(env: Env): Promise<Response> {
  try {
    const square = getSquareClient(env);
    const variations = await square.listBookableServices();

    const admin = adminClient(env);
    const { data: mappings, error } = await admin
      .from("square_service_mappings")
      .select("square_variation_id, treatment_id, tint_product_type, eyelash_safe")
      .eq("active", true);

    if (error) return errorResponse(error.message, 500);

    const mappingByVariation = new Map((mappings ?? []).map((m) => [m.square_variation_id, m]));

    const services = variations.map((v) => ({
      ...v,
      mapping: mappingByVariation.get(v.squareVariationId) ?? null,
    }));

    return json({ services });
  } catch (err) {
    if (err instanceof SquareApiError) return errorResponse(err.message, err.status);
    throw err;
  }
}
