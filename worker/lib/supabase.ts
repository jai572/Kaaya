import { createClient } from "@supabase/supabase-js";
import type { Env } from "../env";

/**
 * Privileged client. Service-role key bypasses RLS — this must only ever run
 * inside the Worker, never be sent to the browser. All consultation reads/writes
 * go through this client; RLS on the tables themselves is a deny-by-default
 * backstop, not the primary access control for this app.
 */
export function adminClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Anon-key client, used only to verify a staff member's Supabase Auth JWT
 * (auth.getUser delegates to Supabase Auth, which checks signature + expiry).
 */
export function authClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}
