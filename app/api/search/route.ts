import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects, type NewProspect } from "@/db/schema";
import { CITIES } from "@/lib/config";
import { placesSearch } from "@/lib/places";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // one city + up to 3 paginated pages (~2s each)

/**
 * POST /api/search  body { keyword, segment, city }  — searches ONE city.
 * The browser loops the selected cities and calls this once per city, so no
 * single request has to search all ten (which would blow the function timeout).
 *
 * Upsert rules (preserved from reference/app.py):
 *  - new place_id  -> insert with status 'New'
 *  - existing      -> merge the incoming segment into the stored tags
 *    (split on " | ", add, unique + sorted, rejoin) and refresh
 *    phone/website/rating/reviews. NEVER overwrite status or notes.
 */
export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  let body: { keyword?: string; segment?: string; city?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const keyword = (body.keyword ?? "").trim();
  const segment = body.segment || "Unclassified";
  const loc = CITIES.find((c) => c.city === body.city);

  if (!keyword) {
    return NextResponse.json({ error: "Type what to search for first." }, { status: 400 });
  }
  if (!loc) {
    return NextResponse.json({ error: "Unknown or missing city." }, { status: 400 });
  }

  let hits;
  try {
    hits = await placesSearch(`${keyword} in ${loc.city}`, loc.region, apiKey);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Places API error" },
      { status: 502 }
    );
  }

  // Drop empties and dedupe by place_id within this batch (a single bulk upsert
  // cannot touch the same conflict target twice).
  const seen = new Set<string>();
  const values: NewProspect[] = [];
  for (const h of hits) {
    if (!h.placeId || seen.has(h.placeId)) continue;
    seen.add(h.placeId);
    values.push({
      placeId: h.placeId,
      company: h.company,
      segment,
      country: loc.country,
      city: loc.city,
      category: h.category,
      address: h.address,
      phone: h.phone,
      website: h.website,
      emails: "",
      rating: h.rating,
      reviews: h.reviews,
      googleMapsUrl: h.googleMapsUrl,
      source: "Google Places",
    });
  }

  if (values.length === 0) {
    return NextResponse.json({ added: 0, updated: 0 });
  }

  const db = getDb();

  // xmax = 0 identifies rows that were inserted (vs updated) in this statement.
  const result = await db
    .insert(prospects)
    .values(values)
    .onConflictDoUpdate({
      target: prospects.placeId,
      set: {
        // merge stored + incoming segment tags: split on " | ", distinct,
        // sorted, non-empty, rejoined — matches the reference exactly.
        segment: sql`(
          SELECT COALESCE(string_agg(tag, ' | ' ORDER BY tag), '')
          FROM (
            SELECT DISTINCT trim(tag) AS tag
            FROM unnest(
              string_to_array(
                COALESCE(${prospects.segment}, '') || ' | ' || COALESCE(excluded.segment, ''),
                ' | '
              )
            ) AS tag
          ) tags
          WHERE trim(tag) <> ''
        )`,
        phone: sql`excluded.phone`,
        website: sql`excluded.website`,
        rating: sql`excluded.rating`,
        reviews: sql`excluded.reviews`,
        updatedAt: sql`now()`,
        // status and notes intentionally omitted — never clobbered on a re-find.
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });

  const added = result.filter((r) => r.inserted).length;
  const updated = result.length - added;

  return NextResponse.json({ added, updated });
}
