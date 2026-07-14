# Dimak Prospector

A lead-generation web app for Dimak Kapi's Gulf fire door export. Search live
company data from the Google Places API, review prospects, track who has been
contacted, and export the list.

This is the deployable rebuild of the local Flask/SQLite prototype in
`reference/`. Stack: **Next.js (App Router) + TypeScript + Tailwind CSS**, with
**Neon Postgres via Drizzle ORM**, deployed on **Vercel** from GitHub.

> **Status:** Phase 1 (scaffold + deploy pipeline). See `CLAUDE.md` for the full
> spec and the phased build plan.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in real values as later phases need them
npm run dev
```

Open http://localhost:3000. A health check lives at `/api/health`.

## Environment variables

Set these in `.env.local` for local dev and in the Vercel project settings for
production. Never commit real values (`.env.local` is gitignored).

| Variable                 | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `DATABASE_URL`           | Neon Postgres connection string (Neon/Vercel integration sets it) |
| `GOOGLE_PLACES_API_KEY`  | Google Cloud key with "Places API (New)" enabled (server-only) |
| `APP_PASSWORD`           | Shared password for the login gate                             |
| `AUTH_SECRET`            | Random string used to sign the auth cookie                     |

See `.env.example` for the template.

## Deploy (GitHub → Vercel)

1. Push to GitHub (this repo).
2. In Vercel, **Add New… → Project** and import the repo. Framework preset is
   detected as **Next.js**; no build settings need changing.
3. Add the environment variables above in the Vercel project settings (the Neon
   integration can set `DATABASE_URL` for you). None are required for the
   Phase 1 minimal page.
4. Vercel builds and deploys on every push to the default branch.

## Access control (password gate)

All pages and `/api/*` routes are protected by Next.js middleware (`middleware.ts`),
except `/login` and the auth routes. Unauthenticated page requests redirect to
`/login`; unauthenticated API requests get `401`. This is a single shared
password (not user accounts) — its job is to stop strangers who find the URL
from triggering billed Google Places calls.

- `/login` posts the password to `/api/auth/login`, which compares it to
  `APP_PASSWORD` and, on success, sets a signed **http-only** cookie
  (HMAC-SHA256 over an expiry, signed with `AUTH_SECRET`, 30-day TTL).
- Middleware verifies that cookie on every request. A tampered or expired
  cookie is rejected. "Log out" (top-right) clears it via `/api/auth/logout`.

**Generate `AUTH_SECRET`** (a long random string) with either:

```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set `APP_PASSWORD` to a strong password of your choice. Put both in Vercel's
environment variables (and `.env.local` for local dev). If either is missing,
login returns `500` and the gate stays closed.

## Cost and safety notes

The Google Places API is billed per request, and the contact fields (phone,
website) sit in a higher pricing tier. Configure both of these in Google Cloud
so a mistake or abuse cannot run up a bill:

- **Daily quota** — APIs & Services → **Places API (New)** → **Quotas & System
  Limits** → filter for **`SearchText` requests per day** (the only method this
  app calls) → set a low cap (e.g. `1,000/day`). One full ten-city search is
  roughly 30 requests.
- **Budget alert** — **Billing → Budgets & alerts → Create budget** (e.g.
  `$10/month`, alerts at 50 / 90 / 100%).
- Restrict the API key to **Places API (New)** (APIs & Services → Credentials →
  the key → API restrictions), and keep it server-side only — it is never
  exposed to the browser.
- The password gate above is the other half: it keeps the billed endpoints off
  the public internet. Keep the password private.

Email enrichment fetches company **websites** (not Google), so it costs nothing
against the Places quota.

## Project layout

```
app/                    Next.js App Router
  api/                  route handlers: config, search, prospects(+update),
                        enrich, export, health, auth/(login|logout)
  login/                the password gate page
  page.tsx              the console (search, table, filters, editing)
middleware.ts           auth gate for all pages + /api/* (except login/auth)
db/                     Drizzle schema + Neon client
drizzle/                generated SQL migration
lib/                    config, places, email, format, auth, types
reference/              the original Flask prototype (source of truth)
CLAUDE.md               authoritative build spec + phased plan
.env.example            environment variable template
```
