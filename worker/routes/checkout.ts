import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { recordAuditEvent } from "../lib/audit";
import { londonDateIso } from "../lib/availability";
import { saleTotals } from "../lib/sales";
import { checkoutSchema } from "../lib/bookingValidation";
import { withStaff } from "./staffBooking";
import { canActFor } from "./staffCalendar";
import { hasCapability } from "../lib/auth";

/** Takes payment and closes out a visit: every appointment passed in is
 * marked completed and linked to one sale. With no appointments it's a
 * walk-in sale (client optional). Payment is recorded, not processed --
 * card payments are taken on the separate card machine. */
export async function checkout(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
    const input = parsed.data;
    const admin = adminClient(env);

    const { data: appts, error: apptError } = input.appointment_ids.length
      ? await admin
          .from("appointments")
          .select("id, client_id, staff_member_id, location_id, status, sale_id, scheduled_at")
          .in("id", input.appointment_ids)
      : { data: [], error: null };
    if (apptError) return errorResponse(apptError.message, 500);
    const appointments = appts ?? [];
    if (appointments.length !== new Set(input.appointment_ids).size) return errorResponse("Appointment not found", 404);

    const staffIds = [
      ...new Set([...appointments.map((a) => a.staff_member_id), ...input.items.map((i) => i.staff_member_id)].filter(Boolean)),
    ] as string[];
    if (!(await canActFor(env, staff, staffIds))) return errorResponse("You can only check out your own clients", 403);

    const today = londonDateIso(new Date().toISOString());
    const clientIds = new Set(appointments.map((a) => a.client_id));
    if (clientIds.size > 1) return errorResponse("These appointments are for different clients", 400);
    const clientId = appointments[0]?.client_id ?? input.client_id ?? null;
    if (input.client_id && clientId !== input.client_id) return errorResponse("Client doesn't match the appointment", 400);
    for (const a of appointments) {
      if (a.location_id !== input.location_id) return errorResponse("Appointment is at a different location", 400);
      if (a.sale_id) return errorResponse("This visit has already been paid for", 409);
      if (a.status === "pending_approval") return errorResponse("Approve the booking before checking out", 400);
      if (a.status !== "confirmed") return errorResponse(`Can't check out a ${a.status.replace("_", "-")} appointment`, 409);
      if (londonDateIso(a.scheduled_at) > today) return errorResponse("This appointment is on a later date", 400);
    }

    const serviceIds = [...new Set(input.items.map((i) => i.service_id).filter(Boolean))] as string[];
    const listPrice = new Map<string, number>();
    if (serviceIds.length) {
      const { data: svc, error } = await admin.from("services").select("id, price_amount").in("id", serviceIds);
      if (error) return errorResponse(error.message, 500);
      if ((svc ?? []).length !== serviceIds.length) return errorResponse("One of the treatments no longer exists", 400);
      for (const x of svc ?? []) listPrice.set(x.id, x.price_amount);
    }

    // Changing a price or giving a discount is a manager/owner decision.
    const priceChanged = input.items.some((i) => !i.service_id || i.unit_price_amount !== listPrice.get(i.service_id));
    const adjusted = priceChanged || input.discount_amount > 0;
    if (adjusted && !(await hasCapability(env, staff, "adjust_sales", ["admin", "owner"]))) {
      return errorResponse("Only a manager or owner can change prices or give discounts", 403);
    }

    const totals = saleTotals(input.items, input.discount_amount);
    if ("error" in totals) return errorResponse(totals.error);

    const { data: sale, error: saleError } = await admin
      .from("sales")
      .insert({
        appointment_id: input.appointment_ids[0] ?? null,
        client_id: clientId,
        location_id: input.location_id,
        subtotal_amount: totals.subtotal,
        discount_amount: totals.discount,
        total_amount: totals.total,
        payment_method: input.payment_method,
        payment_note: input.payment_note,
        price_adjusted: adjusted,
        completed_by: staff.id,
      })
      .select("id")
      .single();
    if (saleError?.code === "23505") return errorResponse("This visit has already been paid for", 409);
    if (saleError || !sale) return errorResponse(saleError?.message ?? "Could not save the sale", 500);

    const undo = async (closed: string[]) => {
      if (closed.length) await admin.from("appointments").update({ status: "confirmed", sale_id: null }).in("id", closed);
      await admin.from("sale_items").delete().eq("sale_id", sale.id);
      await admin.from("sales").delete().eq("id", sale.id);
    };

    const { error: itemsError } = await admin.from("sale_items").insert(
      input.items.map((i) => ({
        sale_id: sale.id,
        service_id: i.service_id ?? null,
        appointment_id: i.appointment_id ?? null,
        staff_member_id: i.staff_member_id ?? null,
        description: i.description,
        quantity: i.quantity,
        unit_price_amount: i.unit_price_amount,
        list_price_amount: i.service_id ? listPrice.get(i.service_id) ?? null : null,
        line_total_amount: i.quantity * i.unit_price_amount,
      }))
    );
    if (itemsError) {
      await undo([]);
      return errorResponse(itemsError.message, 500);
    }

    // Conditional on still being confirmed and unpaid, so two tills can't
    // both take payment for the same visit.
    const closed: string[] = [];
    for (const id of input.appointment_ids) {
      const { data: row, error } = await admin
        .from("appointments")
        .update({ status: "completed", sale_id: sale.id })
        .eq("id", id)
        .eq("status", "confirmed")
        .is("sale_id", null)
        .select("id")
        .maybeSingle();
      if (error || !row) {
        await undo(closed);
        return errorResponse(error?.message ?? "This visit was just checked out by someone else", error ? 500 : 409);
      }
      closed.push(row.id);
    }

    const metadata = { sale_id: sale.id, total_amount: totals.total, payment_method: input.payment_method };
    if (closed.length) {
      for (const id of closed) {
        await recordAuditEvent(admin, { appointment_id: id, actor_id: staff.id, actor_type: "staff", event_type: "sale_completed", metadata });
      }
    } else {
      await recordAuditEvent(admin, { actor_id: staff.id, actor_type: "staff", event_type: "sale_completed", metadata: { ...metadata, walk_in: true } });
    }

    return json({ sale_id: sale.id, total_amount: totals.total }, 201);
  });
}
