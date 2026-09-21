import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { requireStaff, requireRole, AuthError } from "../lib/auth";
import { getSquareClient, SquareApiError } from "../lib/square";
import { recordAuditEvent } from "../lib/audit";
import { createServiceMappingSchema, updateServiceMappingSchema } from "../lib/bookingValidation";

// Read-only: any active staff member can see the mapping state, only
// admin/owner can change it (see requireRole below) — a wrong mapping
// silently changes patch-test/adhesive screening outcomes.
export async function listServicesForMapping(request: Request, env: Env): Promise<Response> {
  try {
    await requireStaff(request, env);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    throw e;
  }

  const admin = adminClient(env);

  try {
    const square = getSquareClient(env);
    const [variations, treatmentsResult, mappingsResult] = await Promise.all([
      square.listBookableServices(),
      admin
        .from("treatments")
        .select("id, name, is_tint, is_eyelash, uses_adhesive, requires_patch_test")
        .eq("active", true)
        .order("display_order", { ascending: true }),
      admin
        .from("square_service_mappings")
        .select("id, square_variation_id, treatment_id, tint_product_type, eyelash_safe, notes, active"),
    ]);

    if (treatmentsResult.error) return errorResponse(treatmentsResult.error.message, 500);
    if (mappingsResult.error) return errorResponse(mappingsResult.error.message, 500);

    const mappingByVariation = new Map((mappingsResult.data ?? []).map((m) => [m.square_variation_id, m]));
    const services = variations.map((v) => ({
      ...v,
      mapping: mappingByVariation.get(v.squareVariationId) ?? null,
    }));

    return json({ services, treatments: treatmentsResult.data ?? [] });
  } catch (err) {
    if (err instanceof SquareApiError) return errorResponse(err.message, err.status);
    throw err;
  }
}

export async function createServiceMapping(request: Request, env: Env): Promise<Response> {
  let staff;
  try {
    staff = await requireStaff(request, env);
    requireRole(staff, ["admin", "owner"]);
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

  const parsed = createServiceMappingSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;

  const admin = adminClient(env);
  const { data: mapping, error } = await admin
    .from("square_service_mappings")
    .insert({
      square_item_id: input.square_item_id,
      square_variation_id: input.square_variation_id,
      treatment_id: input.treatment_id,
      tint_product_type: input.tint_product_type ?? null,
      eyelash_safe: input.eyelash_safe ?? null,
      notes: input.notes ?? null,
      created_by: staff.id,
    })
    .select("id")
    .single();

  if (error || !mapping) return errorResponse(error?.message ?? "Could not save mapping", 500);

  await recordAuditEvent(admin, {
    actor_id: staff.id,
    actor_type: "staff",
    event_type: "square_service_mapping_changed",
    metadata: { mapping_id: mapping.id, square_variation_id: input.square_variation_id, action: "created" },
  });

  return json({ id: mapping.id }, 201);
}

export async function updateServiceMapping(request: Request, env: Env, mappingId: string): Promise<Response> {
  let staff;
  try {
    staff = await requireStaff(request, env);
    requireRole(staff, ["admin", "owner"]);
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

  const parsed = updateServiceMappingSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;

  const admin = adminClient(env);
  const { error } = await admin
    .from("square_service_mappings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", mappingId);

  if (error) return errorResponse(error.message, 500);

  await recordAuditEvent(admin, {
    actor_id: staff.id,
    actor_type: "staff",
    event_type: "square_service_mapping_changed",
    metadata: { mapping_id: mappingId, action: "updated" },
  });

  return json({ updated: true });
}
