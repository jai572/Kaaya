# Kaaya

Beauty salon website + client portal. Stack: GitHub → Cloudflare Workers, Supabase (Postgres/Auth/RLS).

## Consultation module (V1)

The first real feature: a digital client consultation system, replacing the
Shape Blink & Brow paper form. See `shared/` for the question set and
screening rule engine, `worker/` for the API, `src/pages/consultation` and
`src/pages/staff` for the two front ends.

- **Client flow**: `/` — multi-step consultation form, no login required.
  Submission returns a per-consultation access link (`/c/:id?token=...`).
- **Staff flow**: `/staff/login` → `/staff` (consultation list) →
  `/staff/consultations/:id` (review, flags, decision).
- **Screening**: automated, data-driven (`treatment_rules` table +
  `shared/ruleEngine.ts`). Never makes a clinical call — every flag says
  "staff review required" and final suitability stays a staff decision.
- **Square**: source of truth for services, prices, durations, availability,
  team members, customers and bookings. Kaaya stays the source of truth for
  consultation/screening/consent. See `worker/lib/square.ts` for the API
  client and `src/pages/booking` for the booking wizard.

## Infra status

- **Supabase project**: `yfsoxbcqmyzddqtqiuzj` (org "Kaaya Management System", eu-west-1).
  Schema + RLS applied via migrations (run through the Supabase MCP tools, not
  files in this repo — see `mcp__Supabase__list_migrations` for history).
- **Cloudflare**: Worker `kaaya` serves both the built React app (static
  assets) and the `/api/*` routes from one Worker (`worker/index.ts`).
- **GitHub**: this repo. CI workflow at `.github/workflows/deploy.yml` builds
  and deploys on push to `main`.

## Environment / secrets

Three tiers:

1. **Public, client-safe** (Supabase URL + anon/publishable key) — in
   `wrangler.jsonc` `vars` (for the Worker) and `.env.local` `VITE_*` (for
   the Vite build). Safe to expose; RLS enforces access, not key secrecy.
2. **Private, server-only** (Supabase `service_role` key) — never committed.
   The Worker uses it for all consultation reads/writes (RLS on those tables
   is deny-by-default defense-in-depth, not the primary access control).
   Set via GitHub Actions secret `SUPABASE_SERVICE_ROLE_KEY`; CI pushes it to
   the Worker on every deploy via `wrangler secret put` (see workflow).
3. **Cloudflare deploy credentials** (`CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`) — GitHub Actions secrets, CI-only.

Square follows the same first two tiers: `SQUARE_LOCATION_ID` and
`SQUARE_ENVIRONMENT` are public, in `wrangler.jsonc` `vars` (the location id
is already public in Kaaya's Square-hosted booking URL). `SQUARE_ACCESS_TOKEN`
is private, set via GitHub Actions secret `SQUARE_ACCESS_TOKEN`, pushed to
the Worker on deploy the same way as `SUPABASE_SERVICE_ROLE_KEY`. A local-only
`SQUARE_MOCK_MODE=true` in `.dev.vars` (gitignored) swaps in a fixture-backed
Square client so the booking flow can be built/tested without real
credentials — see `worker/lib/square.fixtures.ts`.

## Known gaps / owner review needed

- **Per-treatment attributes** (`requires_patch_test`, `uses_adhesive`,
  `is_eyelash` on the `treatments` table) are seeded with reasonable
  industry-standard defaults, not stated in the source consultation. Review
  and correct via the `treatments` table before relying on the screening
  output.
- **Typed signature** is captured but marked `is_provisional = true` in the
  `signatures` table — nobody's confirmed a typed name carries the same
  legal weight as the paper form's handwritten signature. Flip that once
  confirmed; the UI already surfaces the provisional state to staff.

## Local dev

```
npm install
npm run dev         # Vite dev server (proxies /api to a local wrangler dev on :8787)
npm run worker:dev   # wrangler dev, for testing the API/Worker directly
npm run deploy       # build + manual deploy (normally CI handles this)
```
