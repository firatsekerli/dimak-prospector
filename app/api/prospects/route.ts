import { NextResponse } from "next/server";
import { and, eq, like, asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { cleanEmailsField } from "@/lib/email";

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
      emails: prospects.emails,
      status: prospects.status,
      notes: prospects.notes,
      source: prospects.source,
      createdAt: prospects.createdAt,
      updatedAt: prospects.updatedAt,
    })
    .from(prospects)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(prospects.country), asc(prospects.city), desc(prospects.createdAt));

  const out = rows.map((r) => ({ ...r, emails: cleanEmailsField(r.emails) }));

  // Distinct countries across the whole table (unfiltered) for the filter list.
  const distinctCountries = await db
    .selectDistinct({ country: prospects.country })
    .from(prospects)
    .orderBy(asc(prospects.country));
  const allCountries = distinctCountries.map((d) => d.country).filter((c): c is string => !!c);

  return NextResponse.json({ rows: out, total: out.length, allCountries });
}
