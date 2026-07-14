import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { geoCities } from "@/db/schema";
import { fetchCities } from "@/lib/geonames";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/geo/cities?country=XX — the country's top-10 cities by population,
 * from the geo_cities cache (fetched once from GeoNames on a cold cache).
 */
export async function GET(request: Request) {
  const country = (new URL(request.url).searchParams.get("country") ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return NextResponse.json({ error: "A 2-letter country code is required." }, { status: 400 });
  }

  const db = getDb();
  let rows = await db.select().from(geoCities).where(eq(geoCities.countryCode, country));

  if (rows.length === 0) {
    const username = process.env.GEONAMES_USERNAME;
    if (!username) {
      return NextResponse.json({ error: "GEONAMES_USERNAME is not set on the server." }, { status: 400 });
    }
    let fetched;
    try {
      fetched = await fetchCities(username, country);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "GeoNames error" }, { status: 502 });
    }

    // Dedupe by city name (keep the largest population) before the bulk insert.
    const byCity = new Map<string, { city: string; adminName: string; population: number | null }>();
    for (const c of fetched) {
      const cur = byCity.get(c.city);
      if (!cur || (c.population ?? -1) > (cur.population ?? -1)) byCity.set(c.city, c);
    }
    const values = [...byCity.values()].map((c) => ({
      countryCode: country,
      city: c.city,
      adminName: c.adminName,
      population: c.population,
    }));

    if (values.length > 0) {
      await db.insert(geoCities).values(values).onConflictDoNothing();
      rows = await db.select().from(geoCities).where(eq(geoCities.countryCode, country));
    }
  }

  const cities = rows
    .sort((a, b) => (b.population ?? -1) - (a.population ?? -1))
    .slice(0, 10)
    .map((r) => ({ city: r.city, adminName: r.adminName, population: r.population }));

  return NextResponse.json({ country, cities });
}
