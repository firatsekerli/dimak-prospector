import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Neon Postgres over the serverless HTTP driver (per CLAUDE.md) — this avoids
 * the connection-pool exhaustion that raw TCP clients hit on Vercel's
 * short-lived serverless functions.
 *
 * The client is created lazily and memoized per warm instance so that importing
 * this module never throws when DATABASE_URL is absent (e.g. during a build or
 * on a route that doesn't touch the DB).
 */
type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add it via the Neon–Vercel integration (or .env.local for local dev)."
      );
    }
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}
