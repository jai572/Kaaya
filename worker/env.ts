export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SQUARE_ACCESS_TOKEN: string;
  SQUARE_LOCATION_ID: string;
  SQUARE_ENVIRONMENT: "sandbox" | "production";
  // Local dev only, set via .dev.vars — never in wrangler.jsonc or production.
  // Swaps the real Square client for a fixture-backed one.
  SQUARE_MOCK_MODE?: string;
  ASSETS: Fetcher;
}
