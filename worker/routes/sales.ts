import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { requireCapability, hasCapability } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { londonDateIso } from "../lib/availability";
import { summariseSales, type SaleForSummary } from "../lib/sales";
import { dailySalesQuerySchema, voidSaleSchema } from "../lib/bookingValidation";
import { withStaff } from "./staffBooking";

const DAY_MS = 86400000;

/** One day's takings at one location: totals by payment method (card total
 * is what to check against the card machine), by staff, and every sale with
 * changed prices, discounts and voids flagged. Manager/owner only. */
export async function getDailySales(request: Request, env: Env, url: URL): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_revenue", ["admin", "owner"]);
    const parsed = dailySalesQuerySchema.safeParse({
      location_id: url.searchParams.get("location_id") ?? "",
      date: url.searchParams.get("date") ?? "",
    });
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
    const { location_id, date } = parsed.data;

    const admin = adminClient(env);
    const from = new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString();
    const to = new Date(Date.parse(`${date}T23:59:59Z`) + DAY_MS).toISOString();
    const [salesRes, staffRes, profilesRes] = await Promise.all([
      admin
        .from("sales")
        .select(
          "id, created_at, client_id, subtotal_amount, discount_amount, total_amount, payment_method, payment_note, price_adjusted, completed_by, voided_at, voided_by, void_reason, clients(first_name, last_name), sale_items(id, description, staff_member_id, quantity, unit_price_amount, list_price_amount, line_total_amount)"
        )
        .eq("location_id", location_id)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at"),
      admin.from("staff_members").select("id, display_name, colour"),
      admin.from("staff_profiles").select("id, full_name"),
    ]);
    for (const res of [salesRes, staffRes, profilesRes]) {
      if (res.error) return errorResponse(res.error.message, 500);
    }

    const sales = (salesRes.data ?? []).filter((s) => londonDateIso(s.created_at) === date);
    return json({
      date,
      can_void: await hasCapability(env, staff, "adjust_sales", ["admin", "owner"]),
      summary: summariseSales(sales as unknown as SaleForSummary[]),
      sales,
      staff: staffRes.data ?? [],
      profiles: profilesRes.data ?? [],
    });
  });
}

/** Voids a sale (kept as history, never deleted) and reopens its
 * appointments so the visit can be checked out again correctly. */
export async function voidSale(request: Request, env: Env, saleId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "adjust_sales", ["admin", "owner"]);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = voidSaleSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    const { data: sale, error } = await admin
      .from("sales")
      .update({ voided_at: new Date().toISOString(), voided_by: staff.id, void_reason: parsed.data.reason })
      .eq("id", saleId)
      .is("voided_at", null)
      .select("id, total_amount")
      .maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!sale) {
      const { data: exists } = await admin.from("sales").select("id").eq("id", saleId).maybeSingle();
      return errorResponse(exists ? "This sale has already been voided" : "Sale not found", exists ? 409 : 404);
    }

    const { data: reopened, error: reopenError } = await admin
      .from("appointments")
      .update({ status: "confirmed", sale_id: null })
      .eq("sale_id", saleId)
      .select("id");
    if (reopenError) return errorResponse(reopenError.message, 500);

    const metadata = { sale_id: saleId, total_amount: sale.total_amount, reason: parsed.data.reason };
    if (reopened && reopened.length) {
      for (const a of reopened) {
        await recordAuditEvent(admin, { appointment_id: a.id, actor_id: staff.id, actor_type: "staff", event_type: "sale_voided", metadata });
      }
    } else {
      await recordAuditEvent(admin, { actor_id: staff.id, actor_type: "staff", event_type: "sale_voided", metadata });
    }
    return json({ voided: true, reopened_appointments: (reopened ?? []).length });
  });
}
