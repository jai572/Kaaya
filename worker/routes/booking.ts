import type { Env } from "../env";
import { json, errorResponse } from "../lib/http";
import { adminClient } from "../lib/supabase";
import { recordAuditEvent } from "../lib/audit";
import { computeAvailableSlots, londonDateIso } from "../lib/availability";
import { loadShifts, getBookingWindowDays } from "../lib/schedule";
import { isWithinBookingWindow } from "../lib/rota";
import {
  validateSlotSafeguards,
  performCancel,
  performReschedule,
  isAtLeast24hBefore,
  LifecycleError,
  NON_BLOCKING_STATUSES,
} from "../lib/bookingLifecycle";
import {
  availabilityQuerySchema,
  lookupOrCreateCustomerSchema,
  createAppointmentSchema,
  linkAppointmentToConsultationSchema,
  appointmentReferenceQuerySchema,
  clientCancelAppointmentSchema,
  clientRequestRescheduleSchema,
} from "../lib/bookingValidation";

// Kaaya is the source of truth for all of this now — services, staff,
// availability and bookings all live directly in Supabase.
export async function listBookableServices(env: Env): Promise<Response> {
  const admin = adminClient(env);
  const { data, error } = await admin
    .from("services")
    .select(
      "id, name, category_slug, treatment_id, tint_product_type, eyelash_safe, price_amount, price_currency, price_is_from, duration_minutes, display_order, booking_mode"
    )
    .eq("active", true)
    .order("category_slug", { ascending: true })
    .order("display_order", { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return json({ services: data });
}

export async function listStaffForService(env: Env, url: URL): Promise<Response> {
  const serviceId = url.searchParams.get("service_id");
  if (!serviceId) return errorResponse("service_id is required");

  const admin = adminClient(env);
  const { data, error } = await admin
    .from("service_staff")
    .select("staff_members(id, display_name, active)")
    .eq("service_id", serviceId);

  if (error) return errorResponse(error.message, 500);
  const staff = (data ?? [])
    .map((row: any) => row.staff_members)
    .filter((m: any): m is { id: string; display_name: string; active: boolean } => !!m && m.active)
    .map(({ id, display_name }: any) => ({ id, display_name }));

  return json({ staff });
}

// Public list of locations clients can pick from first, with opening hours
// and how far ahead they can book. A location with no opening hours shows
// but can't be booked yet.
export async function listPublicLocations(env: Env): Promise<Response> {
  const admin = adminClient(env);
  const [locationsRes, hoursRes, windowDays] = await Promise.all([
    admin.from("locations").select("id, name, phone").eq("active", true).order("display_order").order("name"),
    admin.from("location_hours").select("location_id, day_of_week, open_time, close_time").order("day_of_week"),
    getBookingWindowDays(admin),
  ]);
  if (locationsRes.error) return errorResponse(locationsRes.error.message, 500);
  if (hoursRes.error) return errorResponse(hoursRes.error.message, 500);
  return json({
    booking_window_days: windowDays,
    locations: (locationsRes.data ?? []).map((l) => ({
      ...l,
      hours: (hoursRes.data ?? []).filter((h) => h.location_id === l.id).map(({ location_id: _omit, ...h }) => h),
    })),
  });
}

// Genuine live availability at one location — computed from each staff
// member's shift there that day (regular rota, holidays/changes, opening
// hours) minus their existing bookings anywhere, never cached.
export async function getAvailability(env: Env, url: URL): Promise<Response> {
  const parsed = availabilityQuerySchema.safeParse({
    service_id: url.searchParams.get("service_id") ?? "",
    location_id: url.searchParams.get("location_id") ?? "",
    date: url.searchParams.get("date") ?? "",
    staff_member_id: url.searchParams.get("staff_member_id") ?? undefined,
  });
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const { service_id, location_id, date, staff_member_id } = parsed.data;

  const admin = adminClient(env);

  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, duration_minutes, booking_mode, active")
    .eq("id", service_id)
    .maybeSingle();
  if (serviceError) return errorResponse(serviceError.message, 500);
  if (!service || !service.active) return errorResponse("Service not found", 404);
  if (!service.duration_minutes || service.booking_mode === "walk_in_only") {
    return errorResponse("This treatment can't be booked online — please visit or call.", 400);
  }

  const today = londonDateIso(new Date().toISOString());
  if (!isWithinBookingWindow(date, today, await getBookingWindowDays(admin))) {
    return json({ slots: [] });
  }

  let staffQuery = admin
    .from("service_staff")
    .select("staff_members(id, display_name, active)")
    .eq("service_id", service_id);
  if (staff_member_id) staffQuery = staffQuery.eq("staff_member_id", staff_member_id);
  const { data: staffRows, error: staffError } = await staffQuery;
  if (staffError) return errorResponse(staffError.message, 500);

  const staffMembers = (staffRows ?? [])
    .map((row: any) => row.staff_members)
    .filter((m: any): m is { id: string; display_name: string; active: boolean } => !!m && m.active);

  const day = await loadShifts(admin, { staffMemberIds: staffMembers.map((m) => m.id), locationId: location_id, dateIso: date });
  if (!day.location || !day.location.active) return errorResponse("Location not found", 404);

  // A person can't be in two places: bookings at any location block them.
  // Widened a day each side because date is London-local, scheduled_at UTC.
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString();
  const to = new Date(Date.parse(`${date}T23:59:59Z`) + 86400000).toISOString();
  const working = staffMembers.filter((m) => day.shifts.get(m.id));
  const { data: bookedRows, error: bookedError } = working.length
    ? await admin
        .from("appointments")
        .select("staff_member_id, scheduled_at, end_at")
        .in(
          "staff_member_id",
          working.map((m) => m.id)
        )
        .not("status", "in", `(${NON_BLOCKING_STATUSES.join(",")})`)
        .gte("scheduled_at", from)
        .lte("scheduled_at", to)
    : { data: [], error: null };
  if (bookedError) return errorResponse(bookedError.message, 500);

  // Breaks and other blocked time are off-limits online, wherever they are.
  const { data: blockRows, error: blockError } = working.length
    ? await admin
        .from("time_blocks")
        .select("staff_member_id, start_at, end_at")
        .in(
          "staff_member_id",
          working.map((m) => m.id)
        )
        .lt("start_at", to)
        .gt("end_at", from)
    : { data: [], error: null };
  if (blockError) return errorResponse(blockError.message, 500);

  const allSlots: { staffMemberId: string; staffMemberName: string; startAt: string; endAt: string }[] = [];
  const nowIso = new Date().toISOString();
  for (const member of working) {
    const slots = computeAvailableSlots({
      dateIso: date,
      durationMinutes: service.duration_minutes,
      workingBlock: day.shifts.get(member.id) ?? null,
      bookedIntervals: [
        ...(bookedRows ?? []).filter((b) => b.staff_member_id === member.id).map((b) => ({ startAt: b.scheduled_at, endAt: b.end_at })),
        ...(blockRows ?? []).filter((b) => b.staff_member_id === member.id).map((b) => ({ startAt: b.start_at, endAt: b.end_at })),
      ],
      nowIso,
    });
    for (const slot of slots) {
      allSlots.push({ staffMemberId: member.id, staffMemberName: member.display_name, ...slot });
    }
  }

  allSlots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return json({ slots: allSlots });
}

// Plain upsert-by-email; no external customer system to reconcile with.
export async function lookupOrCreateCustomer(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const parsed = lookupOrCreateCustomerSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const { contact } = parsed.data;
  const email = contact.email.toLowerCase();

  const admin = adminClient(env);
  const { data: existingClient, error: lookupError } = await admin
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) return errorResponse(lookupError.message, 500);

  // An existing client's stored details are never changed from this public
  // form: knowing someone's email must not let anyone rename them or swap
  // their phone number. Staff update details from the client record.
  if (existingClient) return json({ client_id: existingClient.id });

  const { data: newClient, error: clientError } = await admin
    .from("clients")
    .insert({ first_name: contact.first_name, last_name: contact.last_name, email, phone: contact.phone })
    .select("id")
    .single();
  if (clientError?.code === "23505") {
    // Created by a parallel request a moment ago -- same person.
    const { data: raced } = await admin.from("clients").select("id").eq("email", email).maybeSingle();
    if (raced) return json({ client_id: raced.id });
  }
  if (clientError || !newClient) return errorResponse(clientError?.message ?? "Could not create client", 500);
  return json({ client_id: newClient.id });
}

export async function createAppointment(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const input = parsed.data;

  const admin = adminClient(env);

  // Re-fetch authoritative price/duration/name server-side -- never trust
  // client-supplied values for what Kaaya's own services table owns.
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, name, duration_minutes, price_amount, price_currency, booking_mode, active")
    .eq("id", input.service_id)
    .maybeSingle();
  if (serviceError) return errorResponse(serviceError.message, 500);
  if (!service || !service.active || !service.duration_minutes) return errorResponse("Service not bookable", 400);
  if (service.booking_mode === "walk_in_only") {
    return errorResponse("This treatment can't be booked online — please visit or call.", 400);
  }

  const startAt = new Date(input.start_at);
  const endAt = new Date(startAt.getTime() + service.duration_minutes * 60000);

  const today = londonDateIso(new Date().toISOString());
  if (!isWithinBookingWindow(londonDateIso(startAt.toISOString()), today, await getBookingWindowDays(admin))) {
    return errorResponse("That date is too far ahead to book online — please call us.", 400);
  }

  // Re-validates the exact requested slot server-side -- the availability
  // endpoint's slot list is the common-case UX, this is the actual gate.
  const safeguardError = await validateSlotSafeguards(admin, {
    serviceIds: [service.id],
    staffMemberId: input.staff_member_id,
    locationId: input.location_id,
    startAtIso: startAt.toISOString(),
    endAtIso: endAt.toISOString(),
  });
  if (safeguardError) return errorResponse(safeguardError, 400);

  const idempotencyKey = crypto.randomUUID();

  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .insert({
      client_id: input.client_id,
      service_id: service.id,
      staff_member_id: input.staff_member_id,
      service_name: service.name,
      duration_minutes: service.duration_minutes,
      price_amount: service.price_amount,
      price_currency: service.price_currency,
      idempotency_key: idempotencyKey,
      location_id: input.location_id,
      status: "pending_approval",
      scheduled_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    })
    .select("id")
    .single();

  if (appointmentError) {
    // Postgres exclusion-constraint violation -- someone else booked this
    // staff member's overlapping time first. The real race-safety guard;
    // the availability check above is just the common-case UX.
    if (appointmentError.code === "23P01") {
      return errorResponse("This time was just booked — please pick another slot.", 409);
    }
    return errorResponse(appointmentError.message, 500);
  }
  if (!appointment) return errorResponse("Could not save appointment", 500);

  const { error: itemError } = await admin.from("appointment_items").insert({
    appointment_id: appointment.id,
    service_id: service.id,
    staff_member_id: input.staff_member_id,
    service_name: service.name,
    duration_minutes: service.duration_minutes,
    price_amount: service.price_amount,
    price_currency: service.price_currency,
  });
  if (itemError) console.error("appointment_items insert failed", appointment.id, itemError);

  const { data: location } = await admin.from("locations").select("name").eq("id", input.location_id).maybeSingle();

  await recordAuditEvent(admin, {
    appointment_id: appointment.id,
    actor_id: null,
    actor_type: "client",
    event_type: "appointment_booked",
    metadata: { service_id: service.id, staff_member_id: input.staff_member_id, location_id: input.location_id },
  });

  return json(
    {
      appointment_id: appointment.id,
      booking_reference: idempotencyKey,
      summary: {
        service_name: service.name,
        duration_minutes: service.duration_minutes,
        price_amount: service.price_amount,
        price_currency: service.price_currency,
        start_at: startAt.toISOString(),
        location_name: location?.name ?? null,
      },
    },
    201
  );
}

// Wires up appointments.consultation_id after the fact. Self-verifying: the
// caller can only know booking_reference (the appointment's idempotency
// key) if they were actually present through the booking confirmation step.
export async function linkAppointmentToConsultation(
  request: Request,
  env: Env,
  appointmentId: string
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const parsed = linkAppointmentToConsultationSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
  const { consultation_id, booking_reference } = parsed.data;

  const admin = adminClient(env);

  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .select("id, client_id, idempotency_key")
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) return errorResponse(appointmentError.message, 500);
  if (!appointment || appointment.idempotency_key !== booking_reference) {
    return errorResponse("Appointment not found", 404);
  }

  const { data: consultation, error: consultationError } = await admin
    .from("consultations")
    .select("id, client_id")
    .eq("id", consultation_id)
    .maybeSingle();
  if (consultationError) return errorResponse(consultationError.message, 500);
  if (!consultation || consultation.client_id !== appointment.client_id) {
    return errorResponse("Consultation does not match this appointment's client", 400);
  }

  const { error: updateError } = await admin.from("appointments").update({ consultation_id }).eq("id", appointmentId);
  if (updateError) return errorResponse(updateError.message, 500);

  await recordAuditEvent(admin, {
    consultation_id,
    appointment_id: appointmentId,
    actor_id: null,
    actor_type: "client",
    event_type: "appointment_linked_to_consultation",
    metadata: { booking_reference },
  });

  return json({ linked: true });
}

// Same self-verification pattern as linkAppointmentToConsultation above:
// knowledge of booking_reference (the appointment's idempotency key) is the
// only credential a client has, since there's no login for this flow.
const APPOINTMENT_LOOKUP_COLUMNS =
  "id, client_id, status, scheduled_at, end_at, service_id, service_name, duration_minutes, price_amount, price_currency, staff_member_id, idempotency_key, rescheduled_to_id, location_id";

async function loadOwnedAppointment(admin: ReturnType<typeof adminClient>, appointmentId: string, bookingReference: string) {
  const { data, error } = await admin
    .from("appointments")
    .select(APPOINTMENT_LOOKUP_COLUMNS)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) return { error: errorResponse(error.message, 500) };
  if (!data || data.idempotency_key !== bookingReference) {
    return { error: errorResponse("Appointment not found", 404) };
  }
  return { appointment: data };
}

// A client only ever has the reference from their *original* booking -- if
// staff (or the client themselves) later reschedules it, that original link
// is the only way back in. Follows rescheduled_to_id forward to whichever
// appointment is actually current, using the original reference as
// continued proof of ownership (client_id is preserved on every hop by
// performReschedule, so the chain never crosses to someone else's booking).
async function resolveCurrentAppointment(admin: ReturnType<typeof adminClient>, appointmentId: string, bookingReference: string) {
  const { appointment, error } = await loadOwnedAppointment(admin, appointmentId, bookingReference);
  if (error) return { error };
  const ownerClientId = appointment!.client_id;
  let current = appointment!;
  const seen = new Set([current.id]);
  while (current.status === "rescheduled" && current.rescheduled_to_id && !seen.has(current.rescheduled_to_id)) {
    const { data: next, error: nextError } = await admin
      .from("appointments")
      .select(APPOINTMENT_LOOKUP_COLUMNS)
      .eq("id", current.rescheduled_to_id)
      .maybeSingle();
    if (nextError) return { error: errorResponse(nextError.message, 500) };
    if (!next) break;
    // Defense in depth: every hop must belong to the same client as the
    // original reference-verified row. performReschedule always copies
    // client_id onto the new row, so this never legitimately differs --
    // if it ever does, treat the chain as broken rather than follow it.
    if (next.client_id !== ownerClientId) {
      return { error: errorResponse("Appointment not found", 404) };
    }
    seen.add(next.id);
    current = next;
  }
  return { appointment: current, resolvedFromOriginal: current.id !== appointment!.id };
}

export async function getAppointmentByReference(env: Env, url: URL, appointmentId: string): Promise<Response> {
  const parsed = appointmentReferenceQuerySchema.safeParse({ booking_reference: url.searchParams.get("booking_reference") ?? "" });
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

  const admin = adminClient(env);
  const { appointment, error, resolvedFromOriginal } = await resolveCurrentAppointment(admin, appointmentId, parsed.data.booking_reference);
  if (error) return error;

  const canSelfService = ["pending_approval", "confirmed"].includes(appointment!.status);
  const { data: location } = appointment!.location_id
    ? await admin.from("locations").select("name").eq("id", appointment!.location_id).maybeSingle()
    : { data: null };
  return json({
    appointment: {
      id: appointment!.id,
      status: appointment!.status,
      service_id: appointment!.service_id,
      service_name: appointment!.service_name,
      scheduled_at: appointment!.scheduled_at,
      end_at: appointment!.end_at,
      duration_minutes: appointment!.duration_minutes,
      price_amount: appointment!.price_amount,
      price_currency: appointment!.price_currency,
      staff_member_id: appointment!.staff_member_id,
      rescheduled_to_id: appointment!.rescheduled_to_id,
      location_id: appointment!.location_id,
      location_name: location?.name ?? null,
    },
    resolved_from_original: resolvedFromOriginal ?? false,
    can_self_service: canSelfService,
    can_self_service_immediately: canSelfService && isAtLeast24hBefore(new Date().toISOString(), appointment!.scheduled_at),
  });
}

export async function clientCancelAppointment(request: Request, env: Env, appointmentId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const parsed = clientCancelAppointmentSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

  const admin = adminClient(env);
  const { appointment, error } = await resolveCurrentAppointment(admin, appointmentId, parsed.data.booking_reference);
  if (error) return error;
  const currentId = appointment!.id;

  if (!["pending_approval", "confirmed"].includes(appointment!.status)) {
    return errorResponse("This booking can no longer be cancelled.", 409);
  }

  const actor = { actorId: null, actorType: "client" as const };

  if (isAtLeast24hBefore(new Date().toISOString(), appointment!.scheduled_at)) {
    try {
      await performCancel(admin, currentId, actor, parsed.data.reason ?? null);
    } catch (e) {
      if (e instanceof LifecycleError) return errorResponse(e.message, e.status);
      throw e;
    }
    return json({ status: "cancelled" });
  }

  const { error: insertError } = await admin.from("appointment_change_requests").insert({
    appointment_id: currentId,
    request_type: "cancel",
    reason: parsed.data.reason ?? null,
  });
  if (insertError) return errorResponse(insertError.message, 500);

  await recordAuditEvent(admin, {
    appointment_id: currentId,
    actor_id: null,
    actor_type: "client",
    event_type: "change_requested",
    metadata: { request_type: "cancel", reason: parsed.data.reason ?? null },
  });
  return json({ status: "pending_staff_approval" });
}

export async function clientRequestReschedule(request: Request, env: Env, appointmentId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const parsed = clientRequestRescheduleSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

  const admin = adminClient(env);
  const { appointment, error } = await resolveCurrentAppointment(admin, appointmentId, parsed.data.booking_reference);
  if (error) return error;
  const currentId = appointment!.id;

  if (!["pending_approval", "confirmed"].includes(appointment!.status)) {
    return errorResponse("This booking can no longer be rescheduled.", 409);
  }

  const today = londonDateIso(new Date().toISOString());
  if (!isWithinBookingWindow(londonDateIso(parsed.data.new_start_at), today, await getBookingWindowDays(admin))) {
    return errorResponse("That date is too far ahead to book online — please call us.", 400);
  }

  const actor = { actorId: null, actorType: "client" as const };

  if (isAtLeast24hBefore(new Date().toISOString(), appointment!.scheduled_at)) {
    try {
      const { newAppointmentId } = await performReschedule(admin, {
        appointmentId: currentId,
        actor,
        newStartAtIso: parsed.data.new_start_at,
        newStaffMemberId: parsed.data.new_staff_member_id,
      });
      return json({ status: "rescheduled", new_appointment_id: newAppointmentId });
    } catch (e) {
      if (e instanceof LifecycleError) return errorResponse(e.message, e.status);
      throw e;
    }
  }

  const { error: insertError } = await admin.from("appointment_change_requests").insert({
    appointment_id: currentId,
    request_type: "reschedule",
    requested_start_at: parsed.data.new_start_at,
    requested_staff_member_id: parsed.data.new_staff_member_id ?? null,
  });
  if (insertError) return errorResponse(insertError.message, 500);

  await recordAuditEvent(admin, {
    appointment_id: currentId,
    actor_id: null,
    actor_type: "client",
    event_type: "change_requested",
    metadata: { request_type: "reschedule", requested_start_at: parsed.data.new_start_at },
  });
  return json({ status: "pending_staff_approval" });
}
