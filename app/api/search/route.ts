import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects, geoCountries, type NewProspect } from "@/db/schema";
import { placesSearch } from "@/lib/places";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // one city + up to 3 paginated pages (~2s each)

/**
 * POST /api/search  body { keyword, segment, city, countryCode }  — one city.
 * The browser loops the selected country's cities and calls this once per city.
 * `countryCode` (ISO2) is used as the Places region bias and resolves to the
 * stored country name via the geo cache.
 *
 * Upsert rules (preserved from reference/app.py): merge segment tags, refresh
 * phone/website/rating/reviews, never overwrite status or notes.
 */
export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  let body: { keyword?: string; segment?: string; city?: string; countryCode?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const keyword = (body.keyword ?? "").trim();
  const segment = (body.segment ?? "").trim(); // optional user tag; "" = don't tag
  const city = (body.city ?? "").trim();
  const countryCode = (body.countryCode ?? "").toUpperCase();

  if (!keyword) {
    return NextResponse.json({ error: "Type what to search for first." }, { status: 400 });
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json({ error: "A country is required." }, { status: 400 });
  }
  if (!city) {
    return NextResponse.json({ error: "A city is required." }, { status: 400 });
  }

  const db = getDb();
  const [countryRow] = await db
    .select()
    .from(geoCountries)
    .where(eq(geoCountries.code, countryCode))
    .limit(1);
  const countryName = countryRow?.name ?? countryCode;

  let hits;
  try {
    hits = await placesSearch(`${keyword} in ${city}`, countryCode, apiKey);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Places API error" },
      { status: 502 }
    );
  }

  const seen = new Set<string>();
  const values: NewProspect[] = [];
  for (const h of hits) {
    if (!h.placeId || seen.has(h.placeId)) continue;
    if (h.businessStatus === "CLOSED_PERMANENTLY") continue; // skip permanently closed
    seen.add(h.placeId);
    values.push({
      placeId: h.placeId,
      company: h.company,
      segment,
      country: countryName,
      city,
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

  const result = await db
    .insert(prospects)
    .values(values)
    .onConflictDoUpdate({
      target: prospects.placeId,
      set: {
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
