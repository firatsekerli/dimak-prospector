# Kickoff prompt for Claude Code

Copy everything in the box below and paste it as your first message to Claude
Code, from inside this project folder.

---

Read `CLAUDE.md` and every file in `reference/` fully before writing any code.

This project rebuilds a working local prototype (`reference/app.py`, a Flask +
SQLite tool) into a deployable web app: Next.js + TypeScript on Vercel, with a
Neon Postgres database, managed on GitHub. `CLAUDE.md` is the authoritative spec,
including the target stack, the data model, the exact Google Places logic to
preserve, the design tokens, and a phased build plan. Follow it.

Important: do not just port the Flask design. It was built for a single machine
and will break on Vercel (ephemeral filesystem, short function timeouts, a public
URL calling a billed API). `CLAUDE.md` explains the required changes: hosted
Postgres instead of SQLite, one city per search request with the browser looping
cities, email lookup as an on-demand action, and a password gate. Build it that
way.

Start with Phase 1 only: confirm the stack choices with me, scaffold the Next.js
+ TypeScript + Tailwind project, initialize git, and get a minimal version
deploying to Vercel so we know the GitHub-to-Vercel pipeline works before adding
features. Preserve the exact Places API field mask and pagination, the
upsert/segment-merge rules (never overwrite status or notes on a re-find), and
the design tokens described in `CLAUDE.md`.

After each phase, show me what changed and exactly how to verify it, then wait
for my go-ahead before the next phase. Whenever you need something from me (the
Google Places API key, the Neon connection string, GitHub or Vercel access, a
decision), ask instead of guessing. Keep secrets out of the repo and in
environment variables.

---

## Things Claude Code will ask you for, so have them ready

- A GitHub account (it will help you create the repo).
- A Vercel account connected to that GitHub.
- A Neon account for the Postgres database (Vercel has a Neon integration that
  sets `DATABASE_URL` for you).
- A Google Cloud project with "Places API (New)" enabled and an API key.
- A password you want to use to log into the app (`APP_PASSWORD`).
