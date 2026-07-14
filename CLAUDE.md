@AGENTS.md

# Dimak Prospector, build spec

You are rebuilding a working local prototype into a deployable web app. Read
this whole file and the files in `reference/` before writing any code.

## What this is

A B2B lead-generation tool for Dimak Kapi, a Turkish fire door manufacturer
exporting to the Gulf. The user (Firat, digital marketing) searches for
companies that buy or specify fire doors (distributors, contractors,
architects, facilities managers) across Gulf cities, reviews them, tracks who
has been contacted, and exports the list. Data comes live from the Google
Places API, so it is fresh and self-owned rather than bought from a stale
third-party database.

## What already works (in `reference/app.py`)

A single-file Flask app with SQLite and a vanilla-JS front end. It searches
Places, stores prospects, merges duplicates, tracks a status pipeline
(New / Contacted / Replied / Not a fit) with notes, generates WhatsApp and email
links, and exports to Excel. The logic is proven and validated offline. Your job
is to rebuild it as a deployable, multi-device app, not to invent new behavior.
When in doubt about how a feature should work, the reference app is the source
of truth.

## Target stack (use this unless you flag a better option and get agreement first)

- Next.js (App Router) with TypeScript
- Tailwind CSS
- Postgres on Neon, accessed with Drizzle ORM and the `@neondatabase/serverless`
  HTTP driver (this avoids serverless connection-pool problems that Prisma and
  raw TCP clients hit on Vercel)
- Deployment: Vercel, from a GitHub repo
- Node 20+

## Why the architecture must change (do not just port the Flask design)

Vercel runs serverless functions, not a persistent server. Three consequences:

1. The filesystem is ephemeral and read-only per invocation, so the SQLite file
   cannot persist. Use hosted Postgres (Neon).
2. A function has a short max duration (on the order of 10 to 60 seconds
   depending on plan and config), which is far too short to search ten cities
   with pagination and website fetches in one request. Split the work: each
   `/api/search` call searches ONE city. The browser loops the selected cities
   and shows a progress bar. Email lookup is a separate on-demand action per
   prospect, never inline in search.
3. The Google API key is billed per request. A public URL that triggers Places
   calls can be abused to drain the budget, so all pages and API routes must sit
   behind a password gate (see Auth). Also document setting a Google Cloud
   budget alert and a daily quota on the key.

## Data model (Postgres via Drizzle)

Table `prospects`:

- `place_id` text primary key (Google Places id, the dedup key)
- `company` text
- `segment` text (may hold multiple tags joined by " | ", see upsert rules)
- `country` text
- `city` text
- `category` text
- `address` text
- `phone` text
- `website` text
- `emails` text (found addresses joined by " | ")
- `rating` real
- `reviews` integer
- `google_maps_url` text
- `status` text, default 'New' (one of: New, Contacted, Replied, Not a fit)
- `notes` text, default ''
- `source` text (e.g. 'Google Places')
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

## Core logic to preserve exactly (proven in `reference/app.py`)

**Places search.** POST `https://places.googleapis.com/v1/places:searchText`.
Headers: `Content-Type: application/json`, `X-Goog-Api-Key: <key>`,
`X-Goog-FieldMask` = the fields below. Body:
`{ "textQuery": "<keyword> in <city>", "regionCode": "<AE|SA|QA|KW|OM|BH>", "languageCode": "en" }`.
Paginate with `nextPageToken` (wait about 2 seconds before reusing the token),
max 3 pages. Field mask:

```
places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,
places.internationalPhoneNumber,places.websiteUri,places.rating,
places.userRatingCount,places.primaryTypeDisplayName,places.googleMapsUri,nextPageToken
```

Phone: prefer `internationalPhoneNumber`, fall back to `nationalPhoneNumber`.

**Upsert by `place_id`.** If the company is new, insert it with `status = 'New'`.
If it already exists: merge the incoming segment into the stored segment tags
(split on " | ", add the new tag, keep unique and sorted, rejoin), and refresh
`phone`, `website`, `rating`, `reviews`. NEVER overwrite `status` or `notes` on
a re-find. This is important: a later search must not wipe a lead the user has
already worked.

**Email extraction.** Regex `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`.
Drop any match containing `example.com`, `sentry.io`, `wixpress.com`, `@2x`,
`.png`, `.jpg`. Fetch these paths off the company website until one yields
addresses: ``, `/contact`, `/contact-us`, `/iletisim`, `/about`. Keep at most 3.
Set a browser-like User-Agent and a timeout. This runs server-side only.

**WhatsApp link.** Strip all non-digits from the phone, then
`https://wa.me/<digits>`.

**Config lists** (expose via `/api/config`, keep editable in one place):

Cities with region codes: Dubai (AE), Abu Dhabi (AE), Sharjah (AE), Riyadh (SA),
Jeddah (SA), Dammam (SA), Doha (QA), Kuwait City (KW), Muscat (OM), Manama (BH).

Segments: Distributor / Trading; Contractor (general / fit-out);
Architect / Specifier; Facility / FM.

Statuses: New, Contacted, Replied, Not a fit.

Term suggestions: fire door supplier, fire rated door distributor, steel door
supplier, doors and hardware supplier, building materials trading company,
architectural hardware supplier, fit out contractor, interior fit out company,
joinery contractor, general contracting company, architecture firm,
architectural consultant, facilities management company.

## API surface

- `GET /api/config` returns cities, segments, terms, statuses.
- `POST /api/search` body `{ keyword, segment, city }` (ONE city). Runs one
  Places search with pagination, upserts, returns `{ added, updated }`.
- `GET /api/prospects` query `country, segment, status, q`. Returns
  `{ rows, total, counts }` where counts is per status. `segment` filter matches
  as a substring (a company may carry several tags).
- `POST /api/prospects/update` body `{ place_id, status?, notes? }`.
- `POST /api/enrich` body `{ place_id }`. Fetches the website, extracts emails,
  saves, returns `{ emails }`.
- `GET /api/export` streams an .xlsx of all prospects (use `exceljs`). A CSV
  fallback is acceptable if simpler.

## Pages and UI

- `/login`: single password field, posts to an auth route, sets a signed
  http-only cookie, redirects to `/`.
- `/`: the console.
  - Search panel: keyword input (with the term suggestions as a datalist),
    a segment select, city chips (all on by default, toggle individually, with
    all/none shortcuts), an "include email lookup" toggle, and a Search button.
  - When Search runs, the browser loops the selected cities calling
    `/api/search` once per city, shows progress (e.g. "Searching Riyadh 4/10"),
    then reloads the table.
  - Stats strip: total shown plus a count per status.
  - Filters: country, segment, status, and a text find.
  - Table: company (with category and a Maps link), segment, location, phone
    (with WhatsApp and site links), email (mailto, plus a "Find email" button
    when empty), rating, a status dropdown that saves on change and recolors,
    and an inline notes field that saves on blur.
  - Export button.

Everything must be responsive down to mobile, keyboard-focusable, and respect
reduced motion.

## Design tokens (carry the prototype's look into Tailwind)

Steel and ink neutrals with a single ember accent (Dimak's orange). Data fields
(phone, rating, emails, ids) in a monospace face; everything else in a clean
system sans. Not a generic SaaS dashboard: it should read like an engineering
console.

```
--bg:      #eef1f4   (cool light steel, not cream)
--panel:   #ffffff
--ink:     #161a20
--steel:   #5b636e
--mute:    #8b939f
--line:    #dde2e8
--ember:   #d2541c   accent (buttons, focus, header rule)
--ember-dk:#9c3d12   hover
status: New #7b8592, Contacted #c9820e, Replied #1f8a54, Not a fit #b04a3f
```

Header is dark (`--ink`) with an ember bottom rule; uppercase, tracked title.
Status shown as a colored pill/select. Reference `reference/app.py` for the full
CSS if you want the exact spacing and table treatment.

## Environment variables

- `DATABASE_URL` (Neon; the Neon Vercel integration can set this automatically)
- `GOOGLE_PLACES_API_KEY`
- `APP_PASSWORD` (the shared login password)
- `AUTH_SECRET` (random string used to sign the auth cookie)

Provide a `.env.example`. Never commit real values.

## Auth (keep it minimal for v1)

One shared password. `/login` posts it, the server compares to `APP_PASSWORD`,
and on success sets a signed http-only cookie. Next.js middleware protects all
pages and `/api/*` except the login and auth routes. This exists mainly to stop
strangers from triggering billed Places calls; it is not full user management.

## Build in phases, and verify each before moving on

1. Scaffold Next.js + TypeScript + Tailwind. Init git. Push to a new GitHub repo.
   Deploy a minimal page to Vercel so the pipeline is proven end to end.
2. Provision Neon. Add the Drizzle schema and a migration. Confirm the app
   connects in a deployed environment, not just locally.
3. `/api/config`, `/api/search` (one city), the client city-loop with progress,
   the table, and the stats strip.
4. Status and notes updates, plus the filters.
5. On-demand email enrichment.
6. Export.
7. Password gate and middleware. Document the Google Cloud budget alert and
   daily quota.

## Acceptance criteria

- Deployed on Vercel behind the password gate, reachable from any device.
- A search across all ten cities completes without a function timing out
  (because it is one city per call from the browser).
- Duplicates dedupe by place_id, segment tags merge, and status/notes are never
  lost on a re-find.
- Status and notes edits persist in Postgres and survive a reload.
- WhatsApp and mailto links work; export downloads a populated file.
- No secret is exposed to the browser; the Places key is only ever used
  server-side.

## Out of scope for v1 (note for later, do not build now)

Tender and procurement portal ingestion and trade-show exhibitor scraping (these
will use Bright Data and feed the same `prospects` table), multi-user accounts,
and CRM export. Design the search layer so additional sources can be added as
new `source` values without reworking the schema.

## v2 (planned, see `docs/V2.md`)

A market-intelligence layer: steel-door (HS `730830`) import statistics per Gulf
country, pulled from the free UN Comtrade API (the source behind ITC TradeMap),
cached in a separate `steel_door_imports` table, to prioritize which markets to
work first. Env var `COMTRADE_API_KEY`. Does not change v1 behavior.
