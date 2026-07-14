import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";

// GET route handlers are dynamic by default since Next 15; force it explicitly
// so this connectivity probe never gets prerendered at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const health: {
    ok: boolean;
    app: string;
    phase: number;
    db: string;
    table: string;
  } = {
    ok: true,
    app: "dimak-prospector",
    phase: 6,
    db: "unknown",
    table: "unknown",
  };

  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    health.db = "connected";

    try {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(prospects);
      health.table = `ready (${n} rows)`;
    } catch {
      health.table = "missing — run drizzle/0000_init_prospects.sql in Neon";
    }
  } catch (e) {
    health.db = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  return NextResponse.json(health);
}
