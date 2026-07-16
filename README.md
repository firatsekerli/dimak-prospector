# Prospector

A white-label B2B lead-generation web app. Search live company data from the
Google Places API, review prospects, tag and segment them, track who has been
contacted, and see per-country import statistics from UN Comtrade.

Business content (name, phone, website, address, category) is **never stored**
— only the Google `place_id` and your own pipeline data are saved, and the
business details are fetched live from Google when a row is shown. See
[Data storage & Google Places compliance](#data-storage--google-places-compliance).

Stack: **Next.js (App Router) + TypeScript + Tailwind CSS**, with **Neon Postgres
via Drizzle ORM**, deployed on **Vercel** from GitHub. Branding (name, logo,
accent color, footer, ads) is set per deployment via env vars — see
[Branding & white-label](#branding--white-label).

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

## Branding & white-label

The app ships unbranded and is re-skinned per deployment through `NEXT_PUBLIC_*`
env vars (baked in at build time — change them and redeploy). Nothing in the code
is tied to a specific company.

| Variable                   | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`     | Header + browser title (default `Prospector`)       |
| `NEXT_PUBLIC_APP_TAGLINE`  | Small subtitle (`""` hides it)                      |
| `NEXT_PUBLIC_LOGO_URL`     | Logo image URL (omit for text-only)                 |
| `NEXT_PUBLIC_ACCENT`       | Accent color hex (buttons, links, focus, header rule) |
| `NEXT_PUBLIC_ACCENT_DARK`  | Accent hover/link shade                             |
| `NEXT_PUBLIC_COMPANY_NAME` | Footer business name                                |
| `NEXT_PUBLIC_COMPANY_URL`  | Footer link                                         |
| `NEXT_PUBLIC_FOOTER_NOTE`  | Extra footer line (email/phone/etc.)                |
| `NEXT_PUBLIC_SHOW_ADS`     | `"1"` shows the ad slot (ad-supported tier)         |

- **White-label a customer:** set their name/logo/accent/footer, leave ads off.
- **Ad-supported tier:** keep your own branding, set `NEXT_PUBLIC_SHOW_ADS=1`, and
  drop your ad network's snippet into `AdSlot` in `components/branding.tsx`.

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

## Data storage & Google Places compliance

The app is built to keep Google's business content out of the database, which is
what the Maps Platform terms require:

- **Stored (in Neon Postgres):** the Google `place_id` (which Google explicitly
  permits storing indefinitely), the **country and city you searched** (your own
  search input), and your **segment tags, status and notes**.
- **Never stored:** business name, phone, website, address, category. These are
  fetched **live** from Place Details (New) each time a row is displayed
  (`POST /api/prospects/details`) and held only in the browser for the session.
- **No bulk export.** There is deliberately no CSV/Excel download of Google
  data. Salespeople work the pipeline inside the app.
- **No email harvesting.** Instead of scraping contact emails (a mailing-list /
  privacy concern), an on-demand **"analyze"** action reads a company's own
  website live and shows non-personal business signals only — certifications,
  business-type words, and company social profiles (`POST /api/prospects/analyze`).
  Nothing from it is stored, and no personal data (names, personal emails) is
  extracted.

This means a search stores only IDs; opening the console re-fetches the details
live. "Refresh live data" (below the filters) clears the in-memory cache and
re-fetches; "Remove permanently-closed" checks each saved `place_id` against
Google and deletes the ones now marked closed.

## Cost and safety notes

The Google Places API is billed per request, and the contact fields (phone,
website) sit in a higher pricing tier. Because details are fetched live per row
on view, cost scales with how many prospects you look at — the app fetches only
the rows on screen and caches them for the browser session to keep this in
check. Configure these in Google Cloud so a mistake or abuse cannot run up a
bill:

- **Daily quota** — APIs & Services → **Places API (New)** → **Quotas & System
  Limits** → set low daily caps on both **`SearchText`** (search) and
  **`GetPlace`** (the live Place Details lookups this app now makes on view).
- **Budget alert** — **Billing → Budgets & alerts → Create budget** (e.g.
  `$10/month`, alerts at 50 / 90 / 100%).
- Restrict the API key to **Places API (New)** (APIs & Services → Credentials →
  the key → API restrictions), and keep it server-side only — it is never
  exposed to the browser.
- The password gate above is the other half: it keeps the billed endpoints off
  the public internet. Keep the password private.

The "analyze" action fetches company **websites** (not Google), so it costs
nothing against the Places quota.

## Project layout

```
app/                    Next.js App Router
  api/                  route handlers: config, search, prospects(+update,
                        +details, +notes, +analyze, +cleanup-closed),
                        market, geo, segments, health, auth/(login|logout)
  login/                the password gate page
  page.tsx              the console (search, table, filters, editing)
middleware.ts           auth gate for all pages + /api/* (except login/auth)
db/                     Drizzle schema + Neon client
drizzle/                generated SQL migration
lib/                    config, places, website, format, auth, types
reference/              the original Flask prototype (source of truth)
CLAUDE.md               authoritative build spec + phased plan
.env.example            environment variable template
```
