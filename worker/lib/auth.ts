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
 * where a mistake has clinical consequences (e.g. Square service mapping),
 * not just general staff access. */
export function requireRole(staff: StaffContext, allowed: StaffContext["role"][]): void {
  if (!allowed.includes(staff.role)) throw new AuthError("Insufficient role", 403);
}
