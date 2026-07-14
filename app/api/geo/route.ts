import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { geoCountries } from "@/db/schema";
import { fetchCountries, SUPPORTED_CONTINENTS } from "@/lib/geonames";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/geo — continents (Asia/Europe/Africa) with their countries, from the
 * geo_countries cache. On a cold cache it fetches the list from GeoNames once
 * and stores it.
 */
export async function GET() {
  const db = getDb();
  let rows = await db.select().from(geoCountries);

  if (rows.length === 0) {
    const username = process.env.GEONAMES_USERNAME;
    if (!username) {
      return NextResponse.json({ error: "GEONAMES_USERNAME is not set on the server." }, { status: 400 });
    }
    let fetched;
    try {
      fetched = await fetchCountries(username);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "GeoNames error" }, { status: 502 });
    }

    const values = fetched
      .filter((c) => c.continent in SUPPORTED_CONTINENTS)
      .map((c) => ({
        code: c.code,
        name: c.name,
        continent: c.continent,
        continentName: SUPPORTED_CONTINENTS[c.continent],
        isoNumeric: c.isoNumeric,
      }));

    if (values.length > 0) {
      await db
        .insert(geoCountries)
        .values(values)
        .onConflictDoNothing({ target: geoCountries.code });
      rows = await db.select().from(geoCountries);
    }
  }

  // Group by continent in a fixed order, countries sorted by name.
  const order = Object.keys(SUPPORTED_CONTINENTS); // AS, EU, AF
  const continents = order.map((code) => ({
    code,
    name: SUPPORTED_CONTINENTS[code],
    countries: rows
      .filter((r) => r.continent === code)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ code: r.code, name: r.name, isoNumeric: r.isoNumeric })),
  }));

  return NextResponse.json({ continents });
}
