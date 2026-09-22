import type { Env } from "../env";
import { adminClient, authClient } from "./supabase";

export interface StaffContext {
  id: string;
  full_name: string;
  role: "staff" | "admin" | "owner";
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Verifies the bearer token against Supabase Auth, then loads the staff profile + role. */
export async function requireStaff(request: Request, env: Env): Promise<StaffContext> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) throw new AuthError("Missing Authorization header");

  const { data, error } = await authClient(env).auth.getUser(token);
  if (error || !data.user) throw new AuthError("Invalid or expired session");

  const admin = adminClient(env);
  const { data: profile, error: profileError } = await admin
    .from("staff_profiles")
    .select("id, full_name, role, active")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile || !profile.active) {
    throw new AuthError("No active staff profile for this account", 403);
  }

  return { id: profile.id, full_name: profile.full_name, role: profile.role };
}

/** Throws if the staff member's role isn't one of `allowed`. Used for surfaces
 * where a mistake has clinical consequences, or that only the account owner
 * should ever manage (e.g. staff permissions themselves) — not capability-
 * overridable, unlike requireCapability below. */
export function requireRole(staff: StaffContext, allowed: StaffContext["role"][]): void {
  if (!allowed.includes(staff.role)) throw new AuthError("Insufficient role", 403);
}

// Feature keys the owner can individually grant/revoke per staff login via
// /staff/permissions, layered on top of the role defaults below.
export type FeatureKey =
  | "manage_services"
  | "manage_staff_members"
  | "manage_service_capability"
  | "view_all_bookings"
  | "manage_all_bookings"
  | "view_revenue";

/** An explicit per-staff override (grant or deny) always wins over the
 * role's default. No override row -> falls back to defaultAllowedRoles. */
export async function hasCapability(
  env: Env,
  staff: StaffContext,
  featureKey: FeatureKey,
  defaultAllowedRoles: StaffContext["role"][]
): Promise<boolean> {
  const admin = adminClient(env);
  const { data: override } = await admin
    .from("staff_feature_overrides")
    .select("granted")
    .eq("staff_profile_id", staff.id)
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (override) return override.granted;
  return defaultAllowedRoles.includes(staff.role);
}

export async function requireCapability(
  env: Env,
  staff: StaffContext,
  featureKey: FeatureKey,
  defaultAllowedRoles: StaffContext["role"][]
): Promise<void> {
  if (!(await hasCapability(env, staff, featureKey, defaultAllowedRoles))) {
    throw new AuthError("Insufficient permission", 403);
  }
}
