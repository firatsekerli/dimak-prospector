import type { Config } from "drizzle-kit";

// `drizzle-kit generate` diffs the schema into SQL migrations under ./drizzle
// and needs no database connection. `db:migrate`/`db:studio` do need
// DATABASE_URL (from .env.local); the migration for v1 is applied by hand in
// the Neon SQL editor, so a live connection is optional.
export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
