import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { enrichEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // fetches up to 5 contact pages per site

/**
 * POST /api/enrich  body { place_id }
 * Fetches the prospect's website, extracts public emails, saves them, and
 * returns { emails }. On-demand and per-prospect — never inline in search.
 */
export async function POST(request: Request) {
  let body: { place_id?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = body.place_id;
  if (!placeId) {
    return NextResponse.json({ error: "place_id is required." }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({ website: prospects.website })
    .from(prospects)
    .where(eq(prospects.placeId, placeId))
    .limit(1);

  if (!row || !row.website) {
    return NextResponse.json({ emails: "" });
  }

  const emails = await enrichEmail(row.website);

  await db
    .update(prospects)
    .set({ emails, updatedAt: sql`now()` })
    .where(eq(prospects.placeId, placeId));

  return NextResponse.json({ emails });
}
