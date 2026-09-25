// Shared appointment-lifecycle logic used by both the public booking routes
// and the staff booking routes, so the transition rules and safeguards live
// in exactly one place rather than being re-implemented per caller.

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "./audit";
import { londonDateIso, isWithinWorkingHours } from "./availability";
import { loadShifts, type Shift } from "./schedule";

export type AppointmentStatus = "pending_approval" | "confirmed" | "completed" | "no_show" | "cancelled" | "rescheduled";

export class LifecycleError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

// The single source of truth for which status moves are legal. Every
// mutating function below calls assertTransition before touching the row.
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending_approval: ["confirmed", "cancelled", "rescheduled"],
  confirmed: ["completed", "no_show", "cancelled", "rescheduled"],
  completed: [],
  no_show: [],
  cancelled: [],
  rescheduled: [],
};

export function assertTransition(current: AppointmentStatus, next: AppointmentStatus): void {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new LifecycleError(`Cannot move an appointment from "${current}" to "${next}"`);
  }
}

/** Statuses that no longer occupy their scheduled slot. Mirrors the DB
 * exclusion constraint's WHERE clause (migration 015) -- kept here as the
 * one shared source of truth so every booked-interval query (availability,
 * revenue, etc.) excludes the same set instead of drifting independently. */
export const NON_BLOCKING_STATUSES: AppointmentStatus[] = ["cancelled", "rescheduled"];

/** Sums price_amount for rows that still represent real, current revenue --
 * excludes NON_BLOCKING_STATUSES so a rescheduled-away row (which kept its
 * original scheduled_at/price_amount as history) never counts a second time
 * against the date it was moved away from, while the new row it points to
 * counts once, on its own date. Applied in application code (in addition to
 * the DB-level query filter) so this stays independently testable and acts
 * as a second line of defense if the query filter is ever changed. */
export function sumAppointmentRevenue(rows: { status: AppointmentStatus; price_amount: number | null }[]): number {
  return rows
    .filter((row) => !NON_BLOCKING_STATUSES.includes(row.status))
    .reduce((sum, row) => sum + (row.price_amount ?? 0), 0);
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Client self-service cutoff: true when the appointment is at least 24h
 * away, per the business rule (>=24h out = client can act immediately;
 * otherwise the request queues for staff approval). */
export function isAtLeast24hBefore(nowIso: string, scheduledAtIso: string): boolean {
  return new Date(scheduledAtIso).getTime() - new Date(nowIso).getTime() >= TWENTY_FOUR_HOURS_MS;
}

interface AppointmentRow {
  id: string;
  client_id: string;
  consultation_id: string | null;
  status: AppointmentStatus;
  scheduled_at: string;
  end_at: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  price_amount: number;
  price_currency: string;
  staff_member_id: string;
  booking_source: string;
  location_id: string | null;
  visit_id: string | null;
}

/** Active appointments for one staff member that overlap an interval.
 * Needed in code (not just the DB constraint) because staff can knowingly
 * double-book (allow_overlap rows sit outside the constraint). */
export async function findOverlaps(
  admin: SupabaseClient,
  params: { staffMemberId: string; startAtIso: string; endAtIso: string; excludeAppointmentId?: string }
): Promise<{ id: string; scheduled_at: string }[]> {
  let query = admin
    .from("appointments")
    .select("id, scheduled_at")
    .eq("staff_member_id", params.staffMemberId)
    .not("status", "in", `(${NON_BLOCKING_STATUSES.join(",")})`)
    .lt("scheduled_at", params.endAtIso)
    .gt("end_at", params.startAtIso);
  if (params.excludeAppointmentId) query = query.neq("id", params.excludeAppointmentId);
  const { data, error } = await query;
  if (error) throw new LifecycleError(error.message, 500);
  return data ?? [];
}

/** Re-validates a specific requested slot server-side. The availability
 * endpoint's slot list is the common-case UX; this is the actual gate on
 * every write. Always: the staff member must be linked to the service.
 * When enforceRota (client bookings): the time must sit inside that person's
 * shift at this location on that date (regular rota, holidays/changes,
 * opening hours), not in the past, and not over blocked time (breaks). Staff bookings skip the rota check
 * by business rule -- staff can book any day, any time. The DB exclusion
 * constraint remains the final backstop against double-booking. */
export async function validateSlotSafeguards(
  admin: SupabaseClient,
  params: {
    serviceIds: string[];
    staffMemberId: string;
    locationId: string | null;
    startAtIso: string;
    endAtIso: string;
    nowIso?: string;
    enforceRota?: boolean;
    excludeAppointmentId?: string;
  }
): Promise<string | null> {
  const { serviceIds, staffMemberId, locationId, startAtIso, endAtIso, nowIso, enforceRota = true, excludeAppointmentId } = params;

  const { data: links, error: linkError } = await admin
    .from("service_staff")
    .select("service_id")
    .in("service_id", serviceIds)
    .eq("staff_member_id", staffMemberId);
  if (linkError) return linkError.message;
  if ((links ?? []).length < new Set(serviceIds).size) return "This staff member isn't set up to do this treatment (Setup → Staff).";

  if (!enforceRota) return null;
  if (!locationId) return "Choose a location.";

  const dateIso = londonDateIso(startAtIso);
  let shift: Shift | null;
  try {
    const day = await loadShifts(admin, { staffMemberIds: [staffMemberId], locationId, dateIso });
    if (!day.location || !day.location.active) return "That location isn't taking bookings.";
    shift = day.shifts.get(staffMemberId) ?? null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not check the rota";
  }

  const withinHours = isWithinWorkingHours({
    dateIso,
    startAtIso,
    endAtIso,
    workingBlock: shift,
    nowIso: nowIso ?? new Date().toISOString(),
  });
  if (!withinHours) return "That time isn't available with this staff member at this location.";

  const { data: blocks, error: blockError } = await admin
    .from("time_blocks")
    .select("id")
    .eq("staff_member_id", staffMemberId)
    .lt("start_at", endAtIso)
    .gt("end_at", startAtIso)
    .limit(1);
  if (blockError) return blockError.message;
  if ((blocks ?? []).length > 0) return "That time isn't available with this staff member at this location.";

  const clashes = await findOverlaps(admin, { staffMemberId, startAtIso, endAtIso, excludeAppointmentId });
  if (clashes.length > 0) return "That time was just booked — please pick another slot.";

  return null;
}

async function loadAppointment(admin: SupabaseClient, appointmentId: string): Promise<AppointmentRow> {
  const { data, error } = await admin
    .from("appointments")
    .select(
      "id, client_id, consultation_id, status, scheduled_at, end_at, service_id, service_name, duration_minutes, price_amount, price_currency, staff_member_id, booking_source, location_id, visit_id"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw new LifecycleError(error.message, 500);
  if (!data) throw new LifecycleError("Appointment not found", 404);
  return data as AppointmentRow;
}

interface Actor {
  actorId: string | null;
  actorType: "client" | "staff" | "system";
}

/** A pending_approval booking whose scheduled time has already passed can no
 * longer be approved -- approving it would just be rubber-stamping a slot
 * that's already gone. This doesn't expire or relabel the appointment (no
 * new status, no automatic transition): it sits there as pending_approval
 * until a staff member explicitly cancels it or otherwise deals with it --
 * only the approve action itself is blocked. */
export function assertNotPastScheduledTime(scheduledAtIso: string, nowIso?: string): void {
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (new Date(scheduledAtIso).getTime() <= now) {
    throw new LifecycleError("This appointment's scheduled time has already passed and can no longer be approved.", 400);
  }
}

export async function performApprove(
  admin: SupabaseClient,
  appointmentId: string,
  actor: Actor,
  nowIso?: string
): Promise<void> {
  const appointment = await loadAppointment(admin, appointmentId);
  assertTransition(appointment.status, "confirmed");
  assertNotPastScheduledTime(appointment.scheduled_at, nowIso);

  const { error } = await admin.from("appointments").update({ status: "confirmed" }).eq("id", appointmentId);
  if (error) throw new LifecycleError(error.message, 500);

  await recordAuditEvent(admin, {
    appointment_id: appointmentId,
    actor_id: actor.actorId,
    actor_type: actor.actorType,
    event_type: "appointment_approved",
  });
}

export async function performCancel(
  admin: SupabaseClient,
  appointmentId: string,
  actor: Actor,
  reason?: string | null
): Promise<void> {
  const appointment = await loadAppointment(admin, appointmentId);
  assertTransition(appointment.status, "cancelled");

  const { error } = await admin.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
  if (error) throw new LifecycleError(error.message, 500);

  await recordAuditEvent(admin, {
    appointment_id: appointmentId,
    actor_id: actor.actorId,
    actor_type: actor.actorType,
    event_type: "appointment_cancelled",
    metadata: reason ? { reason } : {},
  });
}

/** "Reached" the scheduled time, per the business rule -- doesn't wait for
 * the full duration to elapse, just that the appointment has actually
 * started. Pure (given a scheduled_at + now) so it's directly unit-tested
 * below, separate from the DB-backed performComplete/performNoShow that
 * call it. */
export function assertTimeHasArrived(scheduledAtIso: string, nowIso?: string): void {
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  if (new Date(scheduledAtIso).getTime() > now) {
    throw new LifecycleError("This appointment hasn't happened yet.", 400);
  }
}

export async function performComplete(
  admin: SupabaseClient,
  appointmentId: string,
  actor: Actor,
  nowIso?: string
): Promise<void> {
  const appointment = await loadAppointment(admin, appointmentId);
  assertTransition(appointment.status, "completed");
  assertTimeHasArrived(appointment.scheduled_at, nowIso);

  const { error } = await admin.from("appointments").update({ status: "completed" }).eq("id", appointmentId);
  if (error) throw new LifecycleError(error.message, 500);

  await recordAuditEvent(admin, {
    appointment_id: appointmentId,
    actor_id: actor.actorId,
    actor_type: actor.actorType,
    event_type: "appointment_completed",
  });
}

export async function performNoShow(
  admin: SupabaseClient,
  appointmentId: string,
  actor: Actor,
  nowIso?: string
): Promise<void> {
  const appointment = await loadAppointment(admin, appointmentId);
  assertTransition(appointment.status, "no_show");
  assertTimeHasArrived(appointment.scheduled_at, nowIso);

  const { error } = await admin.from("appointments").update({ status: "no_show" }).eq("id", appointmentId);
  if (error) throw new LifecycleError(error.message, 500);

  await recordAuditEvent(admin, {
    appointment_id: appointmentId,
    actor_id: actor.actorId,
    actor_type: actor.actorType,
    event_type: "appointment_no_show",
  });
}

/** Reschedules by leaving the original row in place as real history (moved
 * to 'rescheduled', pointing at the new row via rescheduled_to_id) and
 * inserting a new row for the new time — never overwriting scheduled_at in
 * place. A staff-initiated reschedule (direct, or resolving a client's
 * change request) always yields 'confirmed' -- a staff member acting on an
 * appointment IS the approval. A client's own self-service reschedule never
 * grants approval by itself: the new row inherits the old row's status
 * as-is (confirmed stays confirmed, pending_approval stays pending_approval). */
export async function performReschedule(
  admin: SupabaseClient,
  params: {
    appointmentId: string;
    actor: Actor;
    newStartAtIso: string;
    newStaffMemberId?: string;
    reason?: string | null;
    allowOverlap?: boolean; // staff only: knowingly double-book
  }
): Promise<{ newAppointmentId: string }> {
  const { appointmentId, actor, newStartAtIso, newStaffMemberId, reason } = params;
  const allowOverlap = actor.actorType === "staff" && !!params.allowOverlap;
  const appointment = await loadAppointment(admin, appointmentId);
  assertTransition(appointment.status, "rescheduled");

  const staffMemberId = newStaffMemberId ?? appointment.staff_member_id;
  const durationMs = new Date(appointment.end_at).getTime() - new Date(appointment.scheduled_at).getTime();
  const newEndAtIso = new Date(new Date(newStartAtIso).getTime() + durationMs).toISOString();

  const { data: itemRows, error: itemsError } = await admin
    .from("appointment_items")
    .select("service_id, staff_member_id, service_name, duration_minutes, price_amount, price_currency, added_by")
    .eq("appointment_id", appointmentId);
  if (itemsError) throw new LifecycleError(itemsError.message, 500);
  const items = itemRows ?? [];
  const serviceIds = [...new Set([appointment.service_id, ...items.map((i) => i.service_id).filter((id): id is string => !!id)])];

  const safeguardError = await validateSlotSafeguards(admin, {
    serviceIds,
    staffMemberId,
    locationId: appointment.location_id,
    startAtIso: newStartAtIso,
    endAtIso: newEndAtIso,
    enforceRota: actor.actorType !== "staff",
    excludeAppointmentId: appointmentId,
  });
  if (safeguardError) throw new LifecycleError(safeguardError, 400);

  const newStatus: AppointmentStatus =
    actor.actorType === "staff" || appointment.status === "confirmed" ? "confirmed" : "pending_approval";

  // Claim the old row first, conditional on the status we just read: frees
  // its slot so a small move (10:00 -> 10:15) doesn't collide with itself,
  // and means only one of two simultaneous reschedules can ever win.
  const { data: claimed, error: claimError } = await admin
    .from("appointments")
    .update({ status: "rescheduled" })
    .eq("id", appointmentId)
    .eq("status", appointment.status)
    .select("id")
    .maybeSingle();
  if (claimError) throw new LifecycleError(claimError.message, 500);
  if (!claimed) throw new LifecycleError("This appointment was just changed by someone else — refresh and try again.", 409);

  const restore = () => admin.from("appointments").update({ status: appointment.status }).eq("id", appointmentId);

  const { data: newAppointment, error: insertError } = await admin
    .from("appointments")
    .insert({
      client_id: appointment.client_id,
      consultation_id: appointment.consultation_id,
      service_id: appointment.service_id,
      staff_member_id: staffMemberId,
      service_name: appointment.service_name,
      duration_minutes: appointment.duration_minutes,
      price_amount: appointment.price_amount,
      price_currency: appointment.price_currency,
      idempotency_key: crypto.randomUUID(),
      booking_source: appointment.booking_source,
      location_id: appointment.location_id,
      visit_id: appointment.visit_id,
      allow_overlap: allowOverlap,
      status: newStatus,
      scheduled_at: newStartAtIso,
      end_at: newEndAtIso,
    })
    .select("id")
    .single();
  if (insertError || !newAppointment) {
    await restore();
    if (insertError?.code === "23P01") {
      throw new LifecycleError("That time overlaps another booking for this staff member.", 409);
    }
    throw new LifecycleError(insertError?.message ?? "Could not save the rescheduled appointment", 500);
  }

  // The treatments move with the visit; ones done by the original staff
  // member follow the booking to whoever it's now with.
  const { error: copyError } = items.length
    ? await admin.from("appointment_items").insert(
        items.map((i) => ({
          ...i,
          appointment_id: newAppointment.id,
          staff_member_id: i.staff_member_id === appointment.staff_member_id ? staffMemberId : i.staff_member_id,
        }))
      )
    : { error: null };
  if (copyError) throw new LifecycleError(copyError.message, 500);

  const { error: linkError } = await admin
    .from("appointments")
    .update({ rescheduled_to_id: newAppointment.id })
    .eq("id", appointmentId);
  if (linkError) throw new LifecycleError(linkError.message, 500);

  await recordAuditEvent(admin, {
    appointment_id: appointmentId,
    actor_id: actor.actorId,
    actor_type: actor.actorType,
    event_type: "appointment_rescheduled",
    metadata: {
      new_appointment_id: newAppointment.id,
      previous_scheduled_at: appointment.scheduled_at,
      new_scheduled_at: newStartAtIso,
      ...(reason ? { reason } : {}),
    },
  });

  return { newAppointmentId: newAppointment.id };
}
