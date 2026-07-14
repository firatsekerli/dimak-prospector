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

## Cost and safety notes

- The Google Places API is billed per request, and the contact fields (phone,
  website) sit in a higher pricing tier. Set a **budget alert** and a **daily
  quota** on the key in Google Cloud so a mistake or abuse cannot run up a bill.
- The app is protected by a single shared password so a stranger who finds the
  URL cannot trigger billed searches. Keep that password private.

## Project layout

```
app/                 Next.js App Router (pages + API route handlers)
  api/health/        serverless health check
reference/           the original Flask prototype (source of truth for behavior)
CLAUDE.md            authoritative build spec + phased plan
.env.example         environment variable template
```
