# Kaaya

Beauty salon website + client portal. Stack: GitHub → Cloudflare Workers (static assets), Supabase (Postgres/Auth).

## Infra status

- **Supabase project**: `yfsoxbcqmyzddqtqiuzj` (org "Kaaya Management System", eu-west-1). No tables yet.
- **Cloudflare**: Worker `kaaya` not deployed yet — this repo's `wrangler.jsonc` defines it, first deploy happens via CI on push to `main`, or manually with `npm run deploy`.
- **GitHub**: this repo. CI workflow at `.github/workflows/deploy.yml` deploys on every push to `main`.

## Environment / secrets

Two tiers:

1. **Public, client-safe** (Supabase URL + anon/publishable key) — committed in `wrangler.jsonc` under `vars`, and in `.env.local` for local dev. Safe to expose; Supabase enforces access via Row Level Security (RLS), not key secrecy.
2. **Private, server-only** (Supabase `service_role` key, Cloudflare API token) — never committed. Service role key isn't needed yet (no backend functions using it). When it is, set it with:
   ```
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```

## Manual setup required (one-time)

See the steps the assistant gave you in-chat for creating the Cloudflare API token and adding GitHub Actions secrets — those can't be done by an agent without your account credentials.

## Local dev

```
npm install
npm run dev      # runs the site locally via wrangler
npm run deploy    # manual deploy (normally CI handles this)
```
