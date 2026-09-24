import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { hasCapability, type StaffContext } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { londonDateIso } from "../lib/availability";
import { expandDateRange } from "../lib/rota";
import { shiftsForRange, staffBookingWarnings, sanitiseSearch, type Shift } from "../lib/calendar";
import { validateSlotSafeguards } from "../lib/bookingLifecycle";
import {
  calendarQuerySchema,
  staffCreateAppointmentsSchema,
  createTimeBlockSchema,
  staffCreateClientSchema,
} from "../lib/bookingValidation";
import { withStaff, ownStaffMemberId } from "./staffBooking";

const MAX_RANGE_DAYS = 42;
const DAY_MS = 86400000;

async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
}

/** Own column always; anyone else's needs manage_all_bookings. */
async function canActFor(env: Env, staff: StaffContext, staffMemberIds: string[]): Promise<boolean> {
  if (await hasCapability(env, staff, "manage_all_bookings", ["admin", "owner"])) return true;
  const ownId = await ownStaffMemberId(env, staff.id);
  return !!ownId && staffMemberIds.every((id) => id === ownId);
}

// ---- Calendar feed: everything the Day / Week / List views draw ----

export async function getCalendar(request: Request, env: Env, url: URL): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const parsed = calendarQuerySchema.safeParse({
      location_id: url.searchParams.get("location_id") ?? "",
      from: url.searchParams.get("from") ?? "",
      to: url.searchParams.get("to") ?? "",
    });
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
    const { location_id, from, to } = parsed.data;
    const dates = expandDateRange(from, to);
    if (dates.length > MAX_RANGE_DAYS) return errorResponse(`Pick at most ${MAX_RANGE_DAYS} days`);

    const admin = adminClient(env);
    const canViewAll = await hasCapability(env, staff, "view_all_bookings", ["admin", "owner"]);
    const ownId = await ownStaffMemberId(env, staff.id);

    // Dates are London-local, timestamps UTC: widen a day each side, then
    // keep only rows whose London date falls in the range.
    const fromIso = new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS).toISOString();
    const toIso = new Date(Date.parse(`${to}T23:59:59Z`) + DAY_MS).toISOString();

    const [locationRes, openingRes, staffRes, regularRes, exceptionRes, apptRes, blockRes] = await Promise.all([
      admin.from("locations").select("id, name, active").eq("id", location_id).maybeSingle(),
      admin.from("location_hours").select("day_of_week, open_time, close_time").eq("location_id", location_id),
      admin.from("staff_members").select("id, display_name, colour, active").order("display_name"),
      admin.from("staff_working_hours").select("staff_member_id, day_of_week, start_time, end_time, location_id"),
      admin
        .from("rota_exceptions")
        .select("staff_member_id, date, kind, location_id, start_time, end_time")
        .gte("date", from)
        .lte("date", to),
      admin
        .from("appointments")
        .select(
          "id, client_id, staff_member_id, service_id, service_name, duration_minutes, price_amount, price_currency, status, scheduled_at, end_at, visit_id, booking_source, consultation_id, clients(first_name, last_name, phone, email), appointment_items(id, service_id, service_name, duration_minutes, price_amount, staff_member_id)"
        )
        .eq("location_id", location_id)
        .neq("status", "rescheduled")
        .gte("scheduled_at", fromIso)
        .lte("scheduled_at", toIso)
        .order("scheduled_at"),
      admin
        .from("time_blocks")
        .select("id, staff_member_id, start_at, end_at, reason, note")
        .eq("location_id", location_id)
        .gte("start_at", fromIso)
        .lte("start_at", toIso),
    ]);
    for (const res of [locationRes, openingRes, staffRes, regularRes, exceptionRes, apptRes, blockRes]) {
      if (res.error) return errorResponse(res.error.message, 500);
    }
    if (!locationRes.data) return errorResponse("Location not found", 404);

    const inRange = (iso: string) => {
      const d = londonDateIso(iso);
      return d >= from && d <= to;
    };
    let appointments = (apptRes.data ?? []).filter((a) => inRange(a.scheduled_at as string));
    if (!canViewAll) appointments = appointments.filter((a) => a.staff_member_id === ownId);

    // Patch-test flag per treatment, for the badge.
    const serviceIds = [
      ...new Set(appointments.flatMap((a) => [a.service_id, ...((a.appointment_items as { service_id: string | null }[]) ?? []).map((i) => i.service_id)]).filter(Boolean)),
    ] as string[];
    const patchTest = new Set<string>();
    if (serviceIds.length) {
      const { data: svc, error } = await admin.from("services").select("id, treatments(requires_patch_test)").in("id", serviceIds);
      if (error) return errorResponse(error.message, 500);
      for (const s of svc ?? []) {
        const t = s.treatments as { requires_patch_test?: boolean } | { requires_patch_test?: boolean }[] | null;
        const flag = Array.isArray(t) ? t.some((x) => x.requires_patch_test) : !!t?.requires_patch_test;
        if (flag) patchTest.add(s.id);
      }
    }

    const staffMembers = staffRes.data ?? [];
    const shifts = shiftsForRange({
      locationId: location_id,
      dates,
      staffIds: staffMembers.map((m) => m.id),
      regular: (regularRes.data ?? []) as never,
      exceptions: (exceptionRes.data ?? []) as never,
      opening: openingRes.data ?? [],
    });

    return json({
      location: { ...locationRes.data, hours: openingRes.data ?? [] },
      dates,
      own_staff_member_id: ownId,
      can_view_all: canViewAll,
      staff: staffMembers,
      shifts,
      appointments: appointments.map((a) => ({
        ...a,
        patch_test: [a.service_id, ...((a.appointment_items as { service_id: string | null }[]) ?? []).map((i) => i.service_id)].some(
          (id) => !!id && patchTest.has(id)
        ),
      })),
      blocks: (blockRes.data ?? []).filter((b) => inRange(b.start_at)),
    });
  });
}

// ---- Staff booking: one visit, one or more staff (one appointment each) ----

export async function staffCreateAppointments(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const parsed = staffCreateAppointmentsSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
    const input = parsed.data;

    if (!(await canActFor(env, staff, input.parts.map((p) => p.staff_member_id)))) {
      return errorResponse("You can only book into your own column", 403);
    }

    const admin = adminClient(env);
    const allServiceIds = [...new Set(input.parts.flatMap((p) => p.service_ids))];
    const staffIds = [...new Set(input.parts.map((p) => p.staff_member_id))];

    const [clientRes, locationRes, servicesRes, staffRes] = await Promise.all([
      admin.from("clients").select("id").eq("id", input.client_id).maybeSingle(),
      admin.from("locations").select("id, active").eq("id", input.location_id).maybeSingle(),
      admin.from("services").select("id, name, duration_minutes, price_amount, price_currency, active").in("id", allServiceIds),
      admin.from("staff_members").select("id, display_name, active").in("id", staffIds),
    ]);
    for (const res of [clientRes, locationRes, servicesRes, staffRes]) {
      if (res.error) return errorResponse(res.error.message, 500);
    }
    if (!clientRes.data) return errorResponse("Client not found", 404);
    if (!locationRes.data?.active) return errorResponse("Location not found", 404);
    const services = new Map((servicesRes.data ?? []).map((s) => [s.id, s]));
    const staffById = new Map((staffRes.data ?? []).map((s) => [s.id, s]));

    // Build each part: treatments back-to-back, end = start + total time.
    type Built = {
      staff_member_id: string;
      start_at: string;
      end_at: string;
      services: { id: string; name: string; duration_minutes: number; price_amount: number; price_currency: string }[];
    };
    const built: Built[] = [];
    for (const part of input.parts) {
      const member = staffById.get(part.staff_member_id);
      if (!member?.active) return errorResponse("That staff member isn't active", 400);
      const svcs = [];
      for (const id of part.service_ids) {
        const s = services.get(id);
        if (!s || !s.active) return errorResponse("One of the treatments is no longer available", 400);
        if (!s.duration_minutes) return errorResponse(`"${s.name}" has no duration yet — set one in Setup → Services`, 400);
        svcs.push(s as Built["services"][number]);
      }
      const minutes = svcs.reduce((n, s) => n + s.duration_minutes, 0);
      const start = new Date(part.start_at);
      built.push({
        staff_member_id: part.staff_member_id,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + minutes * 60000).toISOString(),
        services: svcs,
      });
    }

    for (const b of built) {
      const err = await validateSlotSafeguards(admin, {
        serviceIds: b.services.map((s) => s.id),
        staffMemberId: b.staff_member_id,
        locationId: input.location_id,
        startAtIso: b.start_at,
        endAtIso: b.end_at,
        enforceRota: false,
      });
      if (err) return errorResponse(`${staffById.get(b.staff_member_id)!.display_name}: ${err}`, 400);
    }

    // Heads-ups (rota, blocked time, past) -- shown once, never blocking.
    if (!input.confirm_warnings) {
      const warnings: string[] = [];
      for (const b of built) {
        const date = londonDateIso(b.start_at);
        const [regularRes, exceptionRes, openingRes, blocksRes] = await Promise.all([
          admin.from("staff_working_hours").select("staff_member_id, day_of_week, start_time, end_time, location_id").eq("staff_member_id", b.staff_member_id),
          admin.from("rota_exceptions").select("staff_member_id, date, kind, location_id, start_time, end_time").eq("staff_member_id", b.staff_member_id).eq("date", date),
          admin.from("location_hours").select("day_of_week, open_time, close_time").eq("location_id", input.location_id),
          admin.from("time_blocks").select("start_at, end_at").eq("staff_member_id", b.staff_member_id).lt("start_at", b.end_at).gt("end_at", b.start_at),
        ]);
        for (const res of [regularRes, exceptionRes, openingRes, blocksRes]) {
          if (res.error) return errorResponse(res.error.message, 500);
        }
        const shift: Shift | null = shiftsForRange({
          locationId: input.location_id,
          dates: [date],
          staffIds: [b.staff_member_id],
          regular: (regularRes.data ?? []) as never,
          exceptions: (exceptionRes.data ?? []) as never,
          opening: openingRes.data ?? [],
        })[b.staff_member_id][date];
        warnings.push(
          ...staffBookingWarnings({
            staffName: staffById.get(b.staff_member_id)!.display_name,
            start_at: b.start_at,
            end_at: b.end_at,
            shift,
            blocks: blocksRes.data ?? [],
          })
        );
      }
      const unique = [...new Set(warnings)];
      if (unique.length) return json({ needs_confirmation: true, warnings: unique });
    }

    // Linking to an existing appointment joins (or starts) its visit.
    let visitId: string | null = built.length > 1 ? crypto.randomUUID() : null;
    let linkTo: { id: string; visit_id: string | null } | null = null;
    if (input.link_appointment_id) {
      const { data: other, error } = await admin
        .from("appointments")
        .select("id, visit_id, client_id, location_id")
        .eq("id", input.link_appointment_id)
        .maybeSingle();
      if (error) return errorResponse(error.message, 500);
      if (!other || other.client_id !== input.client_id || other.location_id !== input.location_id) {
        return errorResponse("Can only add to a visit for the same client and location", 400);
      }
      linkTo = other;
      visitId = other.visit_id ?? crypto.randomUUID();
    }
    const created: string[] = [];
    const undo = async () => {
      if (created.length) {
        await admin.from("appointment_items").delete().in("appointment_id", created);
        await admin.from("appointments").delete().in("id", created);
      }
    };

    for (const b of built) {
      const { data, error } = await admin
        .from("appointments")
        .insert({
          client_id: input.client_id,
          service_id: b.services[0].id,
          staff_member_id: b.staff_member_id,
          service_name: b.services.map((s) => s.name).join(", "),
          duration_minutes: b.services.reduce((n, s) => n + s.duration_minutes, 0),
          price_amount: b.services.reduce((n, s) => n + s.price_amount, 0),
          price_currency: b.services[0].price_currency,
          idempotency_key: crypto.randomUUID(),
          booking_source: "staff",
          location_id: input.location_id,
          visit_id: visitId,
          status: "confirmed",
          scheduled_at: b.start_at,
          end_at: b.end_at,
        })
        .select("id")
        .single();
      if (error || !data) {
        await undo();
        if (error?.code === "23P01") {
          return errorResponse(`${staffById.get(b.staff_member_id)!.display_name} already has a booking at that time.`, 409);
        }
        return errorResponse(error?.message ?? "Could not save the appointment", 500);
      }
      created.push(data.id);
    }

    const itemRows = built.flatMap((b, i) =>
      b.services.map((s) => ({
        appointment_id: created[i],
        service_id: s.id,
        staff_member_id: b.staff_member_id,
        service_name: s.name,
        duration_minutes: s.duration_minutes,
        price_amount: s.price_amount,
        price_currency: s.price_currency,
        added_by: staff.id,
      }))
    );
    const { error: itemError } = await admin.from("appointment_items").insert(itemRows);
    if (itemError) {
      await undo();
      return errorResponse(itemError.message, 500);
    }

    if (linkTo && !linkTo.visit_id) {
      const { error: linkError } = await admin.from("appointments").update({ visit_id: visitId }).eq("id", linkTo.id);
      if (linkError) return errorResponse(linkError.message, 500);
    }

    for (const [i, id] of created.entries()) {
      await recordAuditEvent(admin, {
        appointment_id: id,
        actor_id: staff.id,
        actor_type: "staff",
        event_type: "appointment_booked",
        metadata: { staff_member_id: built[i].staff_member_id, location_id: input.location_id, visit_id: visitId, source: "staff" },
      });
    }

    return json({ appointment_ids: created, visit_id: visitId }, 201);
  });
}

// ---- Blocked time ----

export async function createTimeBlock(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const parsed = createTimeBlockSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
    if (!(await canActFor(env, staff, [parsed.data.staff_member_id]))) {
      return errorResponse("You can only block your own time", 403);
    }

    const admin = adminClient(env);
    const { data, error } = await admin
      .from("time_blocks")
      .insert({
        ...parsed.data,
        start_at: new Date(parsed.data.start_at).toISOString(),
        end_at: new Date(parsed.data.end_at).toISOString(),
        note: parsed.data.note || null,
        created_by: staff.id,
      })
      .select("id")
      .single();
    if (error || !data) return errorResponse(error?.message ?? "Could not save blocked time", 500);
    return json({ id: data.id }, 201);
  });
}

export async function deleteTimeBlock(request: Request, env: Env, blockId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const admin = adminClient(env);
    const { data: block, error } = await admin.from("time_blocks").select("staff_member_id").eq("id", blockId).maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!block) return errorResponse("Blocked time not found", 404);
    if (!(await canActFor(env, staff, [block.staff_member_id]))) return errorResponse("Insufficient permission", 403);

    const { error: delError } = await admin.from("time_blocks").delete().eq("id", blockId);
    if (delError) return errorResponse(delError.message, 500);
    return json({ deleted: true });
  });
}

// ---- Clients: find or add, for staff bookings ----

export async function searchClients(request: Request, env: Env, url: URL): Promise<Response> {
  return withStaff(request, env, async () => {
    const q = sanitiseSearch(url.searchParams.get("q") ?? "");
    if (q.length < 2) return json({ clients: [] });

    const admin = adminClient(env);
    const words = q.split(" ").filter(Boolean);
    let query = admin.from("clients").select("id, first_name, last_name, phone, email").order("first_name").limit(20);
    // Every word must match somewhere: "jane sm" finds Jane Smith.
    for (const w of words) {
      const digits = w.replace(/[^0-9]/g, "");
      const ors = [`first_name.ilike.%${w}%`, `last_name.ilike.%${w}%`, `email.ilike.%${w}%`];
      if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);
      query = query.or(ors.join(","));
    }
    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);
    return json({ clients: data ?? [] });
  });
}

export async function staffCreateClient(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const parsed = staffCreateClientSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));
    const c = parsed.data;

    const admin = adminClient(env);
    // Same email = same person: reuse the record, never overwrite it here.
    if (c.email) {
      const { data: existing, error } = await admin.from("clients").select("id, first_name, last_name, phone, email").eq("email", c.email).limit(1);
      if (error) return errorResponse(error.message, 500);
      if (existing && existing[0]) return json({ client: existing[0], existing: true });
    }

    const { data, error } = await admin
      .from("clients")
      .insert({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email })
      .select("id, first_name, last_name, phone, email")
      .single();
    if (error || !data) return errorResponse(error?.message ?? "Could not add client", 500);

    await recordAuditEvent(admin, {
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "client_created",
      metadata: { client_id: data.id },
    });
    return json({ client: data, existing: false }, 201);
  });
}
