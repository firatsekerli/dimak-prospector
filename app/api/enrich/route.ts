import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { enrichEmail } from "@/lib/email";
import { placeDetails } from "@/lib/places";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // fetches up to 5 contact pages per site

/**
 * POST /api/enrich  body { place_id, website? }
 *
 * Extracts public emails from the company's own website and stores them (emails
 * are our own data, not Google content). The website itself is not stored, so
 * the client passes the one it already loaded via Place Details; if it's
 * missing we resolve it live from the place_id. Returns { emails }.
 */
export async function POST(request: Request) {
  let body: { place_id?: string; website?: string };
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
  // Confirm the prospect exists before we write emails back to it.
  const [row] = await db
    .select({ placeId: prospects.placeId })
    .from(prospects)
    .where(eq(prospects.placeId, placeId))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  let website = (body.website ?? "").trim();
  if (!website) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      const d = await placeDetails(placeId, apiKey);
      website = d?.website ?? "";
    }
  }

  if (!website) {
    return NextResponse.json({ emails: "" });
  }

  const emails = await enrichEmail(website);

  await db
    .update(prospects)
    .set({ emails, updatedAt: sql`now()` })
    .where(eq(prospects.placeId, placeId));

  return NextResponse.json({ emails });
}
