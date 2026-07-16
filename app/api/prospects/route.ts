import { NextResponse } from "next/server";
import { and, eq, like, asc, desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects, prospectNotes } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/prospects?country=&segment=&status=
 *
 * Returns the stored leads (place_id + the user's own data). Only fields we
 * actually store can be filtered here: country, segment, status. Filtering by
 * category, website or company name happens on the client over the live
 * Place Details data, since those fields are never stored.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const segment = searchParams.get("segment");
  const status = searchParams.get("status");

  const conditions = [];
  if (country && country !== "All") conditions.push(eq(prospects.country, country));
  if (segment && segment !== "All") conditions.push(like(prospects.segment, `%${segment}%`));
  if (status && status !== "All") conditions.push(eq(prospects.status, status));

  const db = getDb();
  const rows = await db
    .select({
      placeId: prospects.placeId,
      segment: prospects.segment,
      country: prospects.country,
      city: prospects.city,
      status: prospects.status,
      source: prospects.source,
      createdAt: prospects.createdAt,
      updatedAt: prospects.updatedAt,
    })
    .from(prospects)
    .where(conditions.length ? and(...conditions) : undefined)
    // place_id is a stable final tiebreaker: rows saved in the same search share
    // an identical created_at, so without it the order shuffles on every reload.
    .orderBy(asc(prospects.country), asc(prospects.city), desc(prospects.createdAt), asc(prospects.placeId));

  // Attach each prospect's note log (newest first).
  const ids = rows.map((r) => r.placeId);
  const noteRows = ids.length
    ? await db
        .select({ id: prospectNotes.id, placeId: prospectNotes.placeId, body: prospectNotes.body, createdAt: prospectNotes.createdAt })
        .from(prospectNotes)
        .where(inArray(prospectNotes.placeId, ids))
        .orderBy(desc(prospectNotes.createdAt))
    : [];
  const notesByPlace = new Map<string, { id: number; body: string; createdAt: Date }[]>();
  for (const n of noteRows) {
    const list = notesByPlace.get(n.placeId) ?? [];
    list.push({ id: n.id, body: n.body, createdAt: n.createdAt });
    notesByPlace.set(n.placeId, list);
  }

  const out = rows.map((r) => ({
    ...r,
    notes: notesByPlace.get(r.placeId) ?? [],
  }));

  // Distinct countries across the whole table (unfiltered) for the filter list.
  const distinctCountries = await db
    .selectDistinct({ country: prospects.country })
    .from(prospects)
    .orderBy(asc(prospects.country));
  const allCountries = distinctCountries.map((d) => d.country).filter((c): c is string => !!c);

  return NextResponse.json({ rows: out, total: out.length, allCountries });
}
