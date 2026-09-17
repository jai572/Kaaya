import { createClient } from "@supabase/supabase-js";

// Anon key only — used for staff sign-in. All consultation data access goes
// through the Worker API (/api/*), never direct Supabase table access from
// the browser.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);
