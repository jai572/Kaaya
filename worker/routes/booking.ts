import type { Env } from "../env";
import { json, errorResponse } from "../lib/http";
import { getSquareClient, SquareApiError } from "../lib/square";
import { adminClient } from "../lib/supabase";
import { recordAuditEvent } from "../lib/audit";
import {
  availabilityQuerySchema,
  lookupOrCreateCustomerSchema,
  createAppointmentSchema,
  linkAppointmentToConsultationSchema,
} from "../lib/bookingValidation";

// Square is the live source of truth here — this only decorates Square's
// own bookable services with whichever Kaaya screening treatment (if any)
// staff have mapped them to via /staff/service-mappings. Never caches price
// or duration as authoritative beyond Square's own live response.
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

export async function listTeamMembersRoute(env: Env, url: URL): Promise<Response> {
  const serviceVariationId = url.searchParams.get("service_variation_id") ?? undefined;
  try {
    const square = getSquareClient(env);
    const teamMembers = await square.listTeamMembers(serviceVariationId);
    return json({ teamMembers });
  } catch (err) {
    if (err instanceof SquareApiError) return errorResponse(err.message, err.status);
    throw err;
  }
}

// Genuine live availability, per booking step 4 — never cached.
export async function getAvailability(env: Env, url: URL): Promise<Response> {
  const parsed = availabilityQuerySchema.safeParse({
    service_variation_id: url.searchParams.get("service_variation_id") ?? "",
    date: url.searchParams.get("date") ?? "",
    team_member_id: url.searchParams.get("team_member_id") ?? undefined,
  });
  if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

  try {
    const square = getSquareClient(env);
    const slots = await square.searchAvailability({
      serviceVariationId: parsed.data.service_variation_id,
      date: parsed.data.date,
      teamMemberId: parsed.data.team_member_id,
    });
    return json({ slots });
  } catch (err) {
    if (err instanceof SquareApiError) return errorResponse(err.message, err.status);
    throw err;
  }
}

// Search-then-create against Square Customers, avoiding duplicate Square
// customer records (workflow step 8). clients.square_customer_id is a cache,
// never authoritative — Square stays the actual source of truth.
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

  try {
    const square = getSquareClient(env);

    const { data: existingClient, error: lookupError } = await admin
      .from("clients")
      .select("id, square_customer_id")
      .eq("email", email)
      .maybeSingle();
    if (lookupError) return errorResponse(lookupError.message, 500);

    let squareCustomerId = existingClient?.square_customer_id ?? null;

    if (!squareCustomerId) {
      const existingSquareCustomer = await square.searchCustomerByEmail(email);
      squareCustomerId = existingSquareCustomer
        ? existingSquareCustomer.id
        : (
            await square.createCustomer({
              givenName: contact.first_name,
              familyName: contact.last_name,
              emailAddress: email,
              phoneNumber: contact.phone,
            })
          ).id;
    }

    let clientId: string;
    if (existingClient) {
      clientId = existingClient.id;
      const { error: updateError } = await admin
        .from("clients")
        .update({
          first_name: contact.first_name,
          last_name: contact.last_name,
          phone: contact.phone,
          square_customer_id: squareCustomerId,
        })
        .eq("id", clientId);
      if (updateError) return errorResponse(updateError.message, 500);
    } else {
      const { data: newClient, error: clientError } = await admin
        .from("clients")
        .insert({
          first_name: contact.first_name,
          last_name: contact.last_name,
          email,
          phone: contact.phone,
          square_customer_id: squareCustomerId,
        })
        .select("id")
        .single();
      if (clientError || !newClient) return errorResponse(clientError?.message ?? "Could not create client", 500);
      clientId = newClient.id;
    }

    return json({ client_id: clientId, square_customer_id: squareCustomerId });
  } catch (err) {
    if (err instanceof SquareApiError) return errorResponse(err.message, err.status);
    throw err;
  }
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

  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, square_customer_id")
    .eq("id", input.client_id)
    .maybeSingle();
  if (clientError) return errorResponse(clientError.message, 500);
  if (!client || client.square_customer_id !== input.square_customer_id) {
    return errorResponse("Client does not match the supplied Square customer", 400);
  }

  try {
    const square = getSquareClient(env);
    // Re-fetch authoritative price/duration/name at booking time — never
    // trust client-supplied values for what Square is the source of truth for.
    const variation = await square.getServiceVariation(input.square_service_variation_id);

    const idempotencyKey = crypto.randomUUID();
    const booking = await square.createBooking({
      startAt: input.start_at,
      customerId: input.square_customer_id,
      teamMemberId: input.team_member_id,
      serviceVariationId: variation.squareVariationId,
      serviceVariationVersion: variation.version,
      durationMinutes: variation.durationMinutes ?? 30,
      idempotencyKey,
    });

    const { data: appointment, error: appointmentError } = await admin
      .from("appointments")
      .insert({
        client_id: client.id,
        square_booking_id: booking.id,
        square_customer_id: input.square_customer_id,
        square_team_member_id: input.team_member_id,
        square_location_id: env.SQUARE_LOCATION_ID,
        square_service_id: input.square_service_id,
        square_service_variation_id: variation.squareVariationId,
        service_name_snapshot: `${variation.serviceName} - ${variation.variationName}`,
        duration_minutes_snapshot: variation.durationMinutes,
        price_amount_snapshot: variation.priceAmount,
        price_currency_snapshot: variation.priceCurrency,
        square_idempotency_key: idempotencyKey,
        status: "scheduled",
        scheduled_at: booking.startAt,
      })
      .select("id")
      .single();

    if (appointmentError || !appointment) {
      return errorResponse(appointmentError?.message ?? "Could not save appointment", 500);
    }

    await recordAuditEvent(admin, {
      appointment_id: appointment.id,
      actor_id: null,
      actor_type: "client",
      event_type: "appointment_booked",
      metadata: { square_booking_id: booking.id },
    });

    return json(
      {
        appointment_id: appointment.id,
        square_booking_id: booking.id,
        summary: {
          service_name: variation.serviceName,
          variation_name: variation.variationName,
          duration_minutes: variation.durationMinutes,
          price_amount: variation.priceAmount,
          price_currency: variation.priceCurrency,
          start_at: booking.startAt,
        },
      },
      201
    );
  } catch (err) {
    if (err instanceof SquareApiError) return errorResponse(err.message, err.status);
    throw err;
  }
}

// Wires up appointments.consultation_id after the fact (booking happens
// before the consultation form, per workflow steps 14-15). Self-verifying:
// the caller can only know square_booking_id if they were actually present
// through the booking confirmation step, so no new token/table is needed.
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
  const { consultation_id, square_booking_id } = parsed.data;

  const admin = adminClient(env);

  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .select("id, client_id, square_booking_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) return errorResponse(appointmentError.message, 500);
  if (!appointment || appointment.square_booking_id !== square_booking_id) {
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

  const { error: updateError } = await admin
    .from("appointments")
    .update({ consultation_id })
    .eq("id", appointmentId);
  if (updateError) return errorResponse(updateError.message, 500);

  await recordAuditEvent(admin, {
    consultation_id,
    appointment_id: appointmentId,
    actor_id: null,
    actor_type: "client",
    event_type: "appointment_linked_to_consultation",
    metadata: { square_booking_id },
  });

  return json({ linked: true });
}
