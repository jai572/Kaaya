import type { Env } from "../env";
import { adminClient } from "../lib/supabase";
import { json, errorResponse } from "../lib/http";
import { requireStaff, requireRole, requireCapability, hasCapability, AuthError, type FeatureKey } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import {
  createServiceSchema,
  updateServiceSchema,
  createStaffMemberSchema,
  updateStaffMemberSchema,
  setStaffWorkingHoursSchema,
  setServiceStaffCapabilitySchema,
  setStaffPermissionsSchema,
} from "../lib/bookingValidation";

const FEATURE_KEYS: FeatureKey[] = [
  "manage_services",
  "manage_staff_members",
  "manage_service_capability",
  "view_all_bookings",
  "manage_all_bookings",
  "view_revenue",
];

async function withStaff<T>(request: Request, env: Env, fn: (staff: Awaited<ReturnType<typeof requireStaff>>) => Promise<T>) {
  try {
    const staff = await requireStaff(request, env);
    return await fn(staff);
  } catch (e) {
    if (e instanceof AuthError) return errorResponse(e.message, e.status);
    throw e;
  }
}

// ---- Services ----

export async function listServicesAdmin(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const [servicesRes, treatmentsRes] = await Promise.all([
      admin.from("services").select("*").order("category_slug").order("display_order"),
      admin
        .from("treatments")
        .select("id, name, is_tint, is_eyelash, uses_adhesive, requires_patch_test")
        .eq("active", true)
        .order("display_order"),
    ]);
    if (servicesRes.error) return errorResponse(servicesRes.error.message, 500);
    if (treatmentsRes.error) return errorResponse(treatmentsRes.error.message, 500);
    return json({ services: servicesRes.data, treatments: treatmentsRes.data });
  });
}

export async function createService(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_services", ["admin", "owner"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = createServiceSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    const { data, error } = await admin.from("services").insert(parsed.data).select("id").single();
    if (error || !data) return errorResponse(error?.message ?? "Could not create service", 500);

    await recordAuditEvent(admin, {
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "service_created",
      metadata: { service_id: data.id },
    });
    return json({ id: data.id }, 201);
  });
}

export async function updateService(request: Request, env: Env, serviceId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_services", ["admin", "owner"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = updateServiceSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    const { error } = await admin
      .from("services")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", serviceId);
    if (error) return errorResponse(error.message, 500);

    await recordAuditEvent(admin, {
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "service_updated",
      metadata: { service_id: serviceId },
    });
    return json({ updated: true });
  });
}

// ---- Staff members ----

export async function listStaffMembers(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const { data, error } = await admin.from("staff_members").select("*").order("display_name");
    if (error) return errorResponse(error.message, 500);
    return json({ staffMembers: data });
  });
}

export async function createStaffMember(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_staff_members", ["admin", "owner"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = createStaffMemberSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    const { data, error } = await admin.from("staff_members").insert(parsed.data).select("id").single();
    if (error || !data) return errorResponse(error?.message ?? "Could not create staff member", 500);
    return json({ id: data.id }, 201);
  });
}

export async function updateStaffMember(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_staff_members", ["admin", "owner"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = updateStaffMemberSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    const { error } = await admin
      .from("staff_members")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", staffMemberId);
    if (error) return errorResponse(error.message, 500);
    return json({ updated: true });
  });
}

async function ownStaffMemberId(env: Env, staffProfileId: string): Promise<string | null> {
  const admin = adminClient(env);
  const { data } = await admin.from("staff_members").select("id").eq("staff_profile_id", staffProfileId).maybeSingle();
  return data?.id ?? null;
}

export async function getStaffWorkingHours(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const ownId = await ownStaffMemberId(env, staff.id);
    if (ownId !== staffMemberId) {
      await requireCapability(env, staff, "manage_staff_members", ["admin", "owner"]);
    }

    const admin = adminClient(env);
    const { data, error } = await admin
      .from("staff_working_hours")
      .select("day_of_week, start_time, end_time")
      .eq("staff_member_id", staffMemberId)
      .order("day_of_week");
    if (error) return errorResponse(error.message, 500);
    return json({ hours: data });
  });
}

export async function setStaffWorkingHours(request: Request, env: Env, staffMemberId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_staff_members", ["admin", "owner"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = setStaffWorkingHoursSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    const { error: deleteError } = await admin.from("staff_working_hours").delete().eq("staff_member_id", staffMemberId);
    if (deleteError) return errorResponse(deleteError.message, 500);

    const rows = parsed.data.blocks
      .filter((b) => b.start_time && b.end_time)
      .map((b) => ({ staff_member_id: staffMemberId, day_of_week: b.day_of_week, start_time: b.start_time, end_time: b.end_time }));

    if (rows.length > 0) {
      const { error: insertError } = await admin.from("staff_working_hours").insert(rows);
      if (insertError) return errorResponse(insertError.message, 500);
    }

    return json({ updated: true });
  });
}

// ---- Service <-> staff capability ----

export async function getServiceStaffCapabilities(request: Request, env: Env, serviceId: string): Promise<Response> {
  return withStaff(request, env, async () => {
    const admin = adminClient(env);
    const { data, error } = await admin.from("service_staff").select("staff_member_id").eq("service_id", serviceId);
    if (error) return errorResponse(error.message, 500);
    return json({ staffMemberIds: (data ?? []).map((r) => r.staff_member_id) });
  });
}

export async function setServiceStaffCapabilities(request: Request, env: Env, serviceId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "manage_service_capability", ["admin", "owner"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = setServiceStaffCapabilitySchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    const { error: deleteError } = await admin.from("service_staff").delete().eq("service_id", serviceId);
    if (deleteError) return errorResponse(deleteError.message, 500);

    if (parsed.data.staff_member_ids.length > 0) {
      const rows = parsed.data.staff_member_ids.map((staff_member_id) => ({ service_id: serviceId, staff_member_id }));
      const { error: insertError } = await admin.from("service_staff").insert(rows);
      if (insertError) return errorResponse(insertError.message, 500);
    }

    return json({ updated: true });
  });
}

// ---- Appointments ----

export async function listAppointments(request: Request, env: Env, url: URL): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const admin = adminClient(env);
    const canViewAll = await hasCapability(env, staff, "view_all_bookings", ["admin", "owner"]);

    let query = admin
      .from("appointments")
      .select("id, client_id, service_id, staff_member_id, service_name, duration_minutes, price_amount, price_currency, status, scheduled_at, end_at")
      .order("scheduled_at", { ascending: true });

    const date = url.searchParams.get("date");
    if (date) query = query.gte("scheduled_at", `${date}T00:00:00.000Z`).lte("scheduled_at", `${date}T23:59:59.999Z`);

    if (!canViewAll) {
      const ownId = await ownStaffMemberId(env, staff.id);
      if (!ownId) return json({ appointments: [] });
      query = query.eq("staff_member_id", ownId);
    }

    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);
    // Deliberately never includes a totals/sum field -- individual rows only.
    return json({ appointments: data });
  });
}

export async function cancelAppointment(request: Request, env: Env, appointmentId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    const admin = adminClient(env);
    const canManageAll = await hasCapability(env, staff, "manage_all_bookings", ["admin", "owner"]);

    if (!canManageAll) {
      const ownId = await ownStaffMemberId(env, staff.id);
      const { data: appointment } = await admin.from("appointments").select("staff_member_id").eq("id", appointmentId).maybeSingle();
      if (!appointment || appointment.staff_member_id !== ownId) {
        return errorResponse("Insufficient permission", 403);
      }
    }

    const { error } = await admin.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
    if (error) return errorResponse(error.message, 500);

    await recordAuditEvent(admin, {
      appointment_id: appointmentId,
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "appointment_cancelled",
    });
    return json({ cancelled: true });
  });
}

// ---- Revenue (admin/owner only, via capability so owner can still override per-login) ----

export async function getRevenueSummary(request: Request, env: Env, url: URL): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    await requireCapability(env, staff, "view_revenue", ["admin", "owner"]);

    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const admin = adminClient(env);
    const { data, error } = await admin
      .from("appointments")
      .select("price_amount")
      .neq("status", "cancelled")
      .gte("scheduled_at", `${date}T00:00:00.000Z`)
      .lte("scheduled_at", `${date}T23:59:59.999Z`);
    if (error) return errorResponse(error.message, 500);

    const total = (data ?? []).reduce((sum, row) => sum + (row.price_amount ?? 0), 0);
    return json({ date, total_amount: total, currency: "GBP", appointment_count: data?.length ?? 0 });
  });
}

// ---- Staff permissions (owner only -- not itself capability-overridable) ----

export async function listStaffPermissions(request: Request, env: Env): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    requireRole(staff, ["owner"]);
    const admin = adminClient(env);
    const [profilesRes, overridesRes] = await Promise.all([
      admin.from("staff_profiles").select("id, full_name, role, active").order("full_name"),
      admin.from("staff_feature_overrides").select("staff_profile_id, feature_key, granted"),
    ]);
    if (profilesRes.error) return errorResponse(profilesRes.error.message, 500);
    if (overridesRes.error) return errorResponse(overridesRes.error.message, 500);
    return json({ staffProfiles: profilesRes.data, overrides: overridesRes.data, featureKeys: FEATURE_KEYS });
  });
}

export async function setStaffPermissions(request: Request, env: Env, staffProfileId: string): Promise<Response> {
  return withStaff(request, env, async (staff) => {
    requireRole(staff, ["owner"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body");
    }
    const parsed = setStaffPermissionsSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues.map((i) => i.message).join("; "));

    const admin = adminClient(env);
    for (const override of parsed.data.overrides) {
      if (override.granted === null) {
        const { error } = await admin
          .from("staff_feature_overrides")
          .delete()
          .eq("staff_profile_id", staffProfileId)
          .eq("feature_key", override.feature_key);
        if (error) return errorResponse(error.message, 500);
      } else {
        const { error } = await admin
          .from("staff_feature_overrides")
          .upsert(
            { staff_profile_id: staffProfileId, feature_key: override.feature_key, granted: override.granted, set_by: staff.id },
            { onConflict: "staff_profile_id,feature_key" }
          );
        if (error) return errorResponse(error.message, 500);
      }
    }

    await recordAuditEvent(admin, {
      actor_id: staff.id,
      actor_type: "staff",
      event_type: "staff_permissions_changed",
      metadata: { staff_profile_id: staffProfileId },
    });
    return json({ updated: true });
  });
}
