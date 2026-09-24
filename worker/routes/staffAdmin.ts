import type { z } from "zod";
import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { requireCapability } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { withStaff } from "./staffBooking";
import { expandDateRange, isAppointmentAffected, type RotaExceptionLike } from "../lib/rota";
import {
  locationSchema,
  updateLocationSchema,
  setLocationHoursSchema,
  bookingSettingsSchema,
  setStaffServicesSchema,
  createRotaExceptionSchema,
  dateOnlySchema,
} from "../lib/bookingValidation";

async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T>; error?: undefined } | { data?: undefined; error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse("Invalid JSON body") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { error: errorResponse(parsed.error.issues.map((i) => i.message).join("; ")) };
  return { data: parsed.data };
}

const LOCATION_ROLES = ["admin", "owner"] as const;

// ---- Locations + opening hours ----

export async function listLocations(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const [locationsRes, hoursRes] = await Promise.all([
      admin.from("locations").select("id, name, phone, email, active, display_order").order("display_order").order("name"),
      admin.from("location_hours").select("location_id, day_of_week, open_time, close_time").order("day_of_week"),
    ]);
    if (locationsRes.error) return errorResponse(locationsRes.error.message, 500);
    if (hoursRes.error) return errorResponse(hoursRes.error.message, 500);
    const locations = (locationsRes.data ?? []).map((l) => ({
      ...l,
      hours: (hoursRes.data ?? []).filter((h) => h.location_id === l.id).map(({ location_id: _omit, ...h }) => h),
    }));
    return json({ locations });
  });
}

export async function createLocation(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_locations", [...LOCATION_ROLES]);
    const { data, error } = await parseBody(request, locationSchema);
    if (error) return error;

    const admin = adminClient(env);
    const { data: row, error: insertError } = await admin.from("locations").insert(data).select("id").single();
    if (insertError || !row) {
      if (insertError?.code === "23505") return errorResponse("A location with that name already exists", 409);
      return errorResponse(insertError?.message ?? "Could not create location", 500);
    }
    await recordAuditEvent(admin, { actor_id: staff.id, actor_type: "staff", event_type: "location_created", metadata: { location_id: row.id } });
    return json({ id: row.id }, 201);
  });
}

export async function updateLocation(request: Request, env: Env, locationId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_locations", [...LOCATION_ROLES]);
    const { data, error } = await parseBody(request, updateLocationSchema);
    if (error) return error;

    const admin = adminClient(env);
    const { error: updateError } = await admin.from("locations").update(data).eq("id", locationId);
    if (updateError) {
      if (updateError.code === "23505") return errorResponse("A location with that name already exists", 409);
      return errorResponse(updateError.message, 500);
    }
    await recordAuditEvent(admin, { actor_id: staff.id, actor_type: "staff", event_type: "location_updated", metadata: { location_id: locationId } });
    return json({ updated: true });
  });
}

export async function setLocationHours(request: Request, env: Env, locationId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_locations", [...LOCATION_ROLES]);
    const { data, error } = await parseBody(request, setLocationHoursSchema);
    if (error) return error;

    const admin = adminClient(env);
    const { error: deleteError } = await admin.from("location_hours").delete().eq("location_id", locationId);
    if (deleteError) return errorResponse(deleteError.message, 500);

    const rows = data.days
      .filter((d) => d.open_time && d.close_time)
      .map((d) => ({ location_id: locationId, day_of_week: d.day_of_week, open_time: d.open_time, close_time: d.close_time }));
    if (rows.length > 0) {
      const { error: insertError } = await admin.from("location_hours").insert(rows);
      if (insertError) return errorResponse(insertError.message, 500);
    }
    await recordAuditEvent(admin, { actor_id: staff.id, actor_type: "staff", event_type: "location_hours_updated", metadata: { location_id: locationId } });
    return json({ updated: true });
  });
}

// ---- Online booking settings ----

export async function getBookingSettings(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const { data, error } = await admin.from("app_settings").select("value").eq("key", "client_booking_window_days").maybeSingle();
    if (error) return errorResponse(error.message, 500);
    return json({ client_booking_window_days: typeof data?.value === "number" ? data.value : 90 });
  });
}

export async function updateBookingSettings(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_locations", [...LOCATION_ROLES]);
    const { data, error } = await parseBody(request, bookingSettingsSchema);
    if (error) return error;

    const admin = adminClient(env);
    const { error: upsertError } = await admin
      .from("app_settings")
      .upsert({ key: "client_booking_window_days", value: data.client_booking_window_days, updated_at: new Date().toISOString() });
    if (upsertError) return errorResponse(upsertError.message, 500);
    await recordAuditEvent(admin, {
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "booking_settings_updated",
      metadata: { client_booking_window_days: data.client_booking_window_days },
    });
    return json({ updated: true });
  });
}

// ---- Which treatments a staff member does ----

export async function getStaffServices(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const { data, error } = await admin.from("service_staff").select("service_id").eq("staff_member_id", staffMemberId);
    if (error) return errorResponse(error.message, 500);
    return json({ serviceIds: (data ?? []).map((r) => r.service_id) });
  });
}

export async function setStaffServices(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_service_capability", ["admin", "owner"]);
    const { data, error } = await parseBody(request, setStaffServicesSchema);
    if (error) return error;

    const admin = adminClient(env);
    const { error: deleteError } = await admin.from("service_staff").delete().eq("staff_member_id", staffMemberId);
    if (deleteError) return errorResponse(deleteError.message, 500);
    if (data.service_ids.length > 0) {
      const rows = data.service_ids.map((service_id) => ({ service_id, staff_member_id: staffMemberId }));
      const { error: insertError } = await admin.from("service_staff").insert(rows);
      if (insertError) return errorResponse(insertError.message, 500);
    }
    return json({ updated: true });
  });
}

// ---- Regular rota (all staff at once) ----

export async function getRota(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const { data, error } = await admin
      .from("staff_working_hours")
      .select("staff_member_id, day_of_week, start_time, end_time, location_id")
      .order("day_of_week");
    if (error) return errorResponse(error.message, 500);
    return json({ hours: data });
  });
}

// ---- Rota exceptions (holiday, sick, cover) ----

type ExceptionRow = RotaExceptionLike & { id: string; staff_member_id: string; reason: string | null; created_at: string };

async function countAffected(admin: ReturnType<typeof adminClient>, exceptions: ExceptionRow[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (exceptions.length === 0) return counts;

  const staffIds = [...new Set(exceptions.map((e) => e.staff_member_id))];
  const dates = exceptions.map((e) => e.date).sort();
  // Widen by a day each side: dates are London-local, scheduled_at is UTC.
  const from = new Date(Date.parse(`${dates[0]}T00:00:00Z`) - 86400000).toISOString();
  const to = new Date(Date.parse(`${dates[dates.length - 1]}T23:59:59Z`) + 86400000).toISOString();

  const { data, error } = await admin
    .from("appointments")
    .select("staff_member_id, scheduled_at, end_at, location_id, status")
    .in("staff_member_id", staffIds)
    .in("status", ["pending_approval", "confirmed"])
    .gte("scheduled_at", from)
    .lte("scheduled_at", to);
  if (error) throw new Error(error.message);

  for (const e of exceptions) {
    const n = (data ?? []).filter((a) => a.staff_member_id === e.staff_member_id && isAppointmentAffected(e, a)).length;
    counts.set(e.id, n);
  }
  return counts;
}

export async function listRotaExceptions(request: Request, env: Env, url: URL): Promise<Response> {
  return withStaff(request, env, async () => {
    const fromParam = url.searchParams.get("from");
    const from = fromParam && dateOnlySchema.safeParse(fromParam).success ? fromParam : new Date().toISOString().slice(0, 10);

    const admin = adminClient(env);
    const { data, error } = await admin
      .from("rota_exceptions")
      .select("id, staff_member_id, date, kind, location_id, start_time, end_time, reason, created_at")
      .gte("date", from)
      .order("date")
      .limit(500);
    if (error) return errorResponse(error.message, 500);

    const rows = (data ?? []) as ExceptionRow[];
    const counts = await countAffected(admin, rows);
    return json({ exceptions: rows.map((r) => ({ ...r, affected_bookings: counts.get(r.id) ?? 0 })) });
  });
}

export async function createRotaExceptions(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_staff_members", ["admin", "owner"]);
    const { data, error } = await parseBody(request, createRotaExceptionSchema);
    if (error) return error;

    const dates = expandDateRange(data.from_date, data.to_date);
    if (dates.length === 0) return errorResponse("Invalid date range");
    if (dates.length > 62) return errorResponse("An exception can cover at most 62 days at a time");

    const working = data.kind === "working";
    const rows = dates.map((date) => ({
      staff_member_id: data.staff_member_id,
      date,
      kind: data.kind,
      location_id: working ? data.location_id : null,
      start_time: working ? data.start_time : null,
      end_time: working ? data.end_time : null,
      reason: data.reason || null,
      created_by: staff.id,
    }));

    const admin = adminClient(env);
    // One exception per person per day: re-entering a day replaces it.
    const { data: saved, error: upsertError } = await admin
      .from("rota_exceptions")
      .upsert(rows, { onConflict: "staff_member_id,date" })
      .select("id, staff_member_id, date, kind, location_id, start_time, end_time, reason, created_at");
    if (upsertError) return errorResponse(upsertError.message, 500);

    const savedRows = (saved ?? []) as ExceptionRow[];
    const counts = await countAffected(admin, savedRows);
    const affected = [...counts.values()].reduce((a, b) => a + b, 0);

    await recordAuditEvent(admin, {
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "rota_exception_saved",
      metadata: { staff_member_id: data.staff_member_id, from_date: data.from_date, to_date: data.to_date, kind: data.kind },
    });
    return json({ saved: savedRows.length, affected_bookings: affected }, 201);
  });
}

export async function deleteRotaException(request: Request, env: Env, exceptionId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_staff_members", ["admin", "owner"]);
    const admin = adminClient(env);
    const { data, error } = await admin.from("rota_exceptions").delete().eq("id", exceptionId).select("staff_member_id, date").maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("Exception not found", 404);
    await recordAuditEvent(admin, {
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "rota_exception_deleted",
      metadata: { staff_member_id: data.staff_member_id, date: data.date },
    });
    return json({ deleted: true });
  });
}

// ---- All staff <-> treatment links in one call (lists show counts) ----

export async function listServiceStaffLinks(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const { data, error } = await admin.from("service_staff").select("service_id, staff_member_id");
    if (error) return errorResponse(error.message, 500);
    return json({ links: data });
  });
}
