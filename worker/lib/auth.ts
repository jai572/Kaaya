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

// TEMPORARY, requested explicitly by the project director for easier testing
// (2026-09-18): staff auth is bypassed when no Authorization header is sent,
// falling back to the first active staff profile so audit trail / staff_reviews
// attribution still works. A real bearer token, if sent, is still verified
// normally below -- this only widens access, it doesn't break login when it's
// used. TO RE-ENABLE: delete the `if (!token)` bypass block and restore the
// original "throw new AuthError('Missing Authorization header')" behavior,
// then re-add the /staff/login redirect gate in the two staff pages and
// restore staffAuthHeader() in src/lib/api.ts to throw when signed out.
async function bypassStaffAuth(env: Env): Promise<StaffContext> {
  const admin = adminClient(env);
  const { data: profile, error } = await admin
    .from("staff_profiles")
    .select("id, full_name, role")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !profile) throw new AuthError("No active staff profile configured", 403);
  return { id: profile.id, full_name: profile.full_name, role: profile.role };
}

/** Verifies the bearer token against Supabase Auth, then loads the staff profile + role. */
export async function requireStaff(request: Request, env: Env): Promise<StaffContext> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return bypassStaffAuth(env);

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
