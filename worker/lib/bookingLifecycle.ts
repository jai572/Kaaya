// Shared appointment-lifecycle logic used by both the public booking routes
// and the staff booking routes, so the transition rules and safeguards live
// in exactly one place rather than being re-implemented per caller.

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "./audit";
import { toDayOfWeek, londonDateIso, isWithinWorkingHours } from "./availability";

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
}

/** Re-validates a specific requested slot server-side. The availability
 * endpoint's slot list is the common-case UX; this is the actual gate on
 * every write, so a client can never book (or reschedule into) a staff
 * member who isn't linked to the service, or a time outside their working
 * hours, regardless of what the client sends. The DB exclusion constraint
 * remains the final backstop against a genuine double-booking race. */
export async function validateSlotSafeguards(
  admin: SupabaseClient,
  params: { serviceId: string; staffMemberId: string; startAtIso: string; endAtIso: string; nowIso?: string }
): Promise<string | null> {
  const { serviceId, staffMemberId, startAtIso, endAtIso, nowIso } = params;

  const { data: link, error: linkError } = await admin
    .from("service_staff")
    .select("service_id")
    .eq("service_id", serviceId)
    .eq("staff_member_id", staffMemberId)
    .maybeSingle();
  if (linkError) return linkError.message;
  if (!link) return "This staff member cannot perform this service.";

  const dateIso = londonDateIso(startAtIso);
  const dayOfWeek = toDayOfWeek(dateIso);
  const { data: hoursRow, error: hoursError } = await admin
    .from("staff_working_hours")
    .select("start_time, end_time")
    .eq("staff_member_id", staffMemberId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();
  if (hoursError) return hoursError.message;

  const withinHours = isWithinWorkingHours({
    dateIso,
    startAtIso,
    endAtIso,
    workingBlock: hoursRow ? { startTime: hoursRow.start_time, endTime: hoursRow.end_time } : null,
    nowIso: nowIso ?? new Date().toISOString(),
  });
  if (!withinHours) return "That time is outside this staff member's working hours.";

  return null;
}

async function loadAppointment(admin: SupabaseClient, appointmentId: string): Promise<AppointmentRow> {
  const { data, error } = await admin
    .from("appointments")
    .select(
      "id, client_id, consultation_id, status, scheduled_at, end_at, service_id, service_name, duration_minutes, price_amount, price_currency, staff_member_id, booking_source"
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
  }
): Promise<{ newAppointmentId: string }> {
  const { appointmentId, actor, newStartAtIso, newStaffMemberId, reason } = params;
  const appointment = await loadAppointment(admin, appointmentId);
  assertTransition(appointment.status, "rescheduled");

  const staffMemberId = newStaffMemberId ?? appointment.staff_member_id;
  const durationMs = new Date(appointment.end_at).getTime() - new Date(appointment.scheduled_at).getTime();
  const newEndAtIso = new Date(new Date(newStartAtIso).getTime() + durationMs).toISOString();

  const safeguardError = await validateSlotSafeguards(admin, {
    serviceId: appointment.service_id,
    staffMemberId,
    startAtIso: newStartAtIso,
    endAtIso: newEndAtIso,
  });
  if (safeguardError) throw new LifecycleError(safeguardError, 400);

  const newStatus: AppointmentStatus =
    actor.actorType === "staff" || appointment.status === "confirmed" ? "confirmed" : "pending_approval";

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
      status: newStatus,
      scheduled_at: newStartAtIso,
      end_at: newEndAtIso,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23P01") {
      throw new LifecycleError("That time was just booked — please pick another slot.", 409);
    }
    throw new LifecycleError(insertError.message, 500);
  }
  if (!newAppointment) throw new LifecycleError("Could not save the rescheduled appointment", 500);

  const { error: updateError } = await admin
    .from("appointments")
    .update({ status: "rescheduled", rescheduled_to_id: newAppointment.id })
    .eq("id", appointmentId);
  if (updateError) throw new LifecycleError(updateError.message, 500);

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
