import { NextResponse } from "next/server";
import { placeDetails } from "@/lib/places";
import { waLink } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bound how many places one request will look up, so a huge list can't fan out
// into an unbounded burst of billed Place Details calls. The browser chunks.
const MAX_IDS_PER_REQUEST = 120;
const CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * POST /api/prospects/details  body { placeIds: string[] }
 *
 * Fetches the live business content (name, phone, website, address, category,
 * maps link, open/closed status) for the given place_ids straight from Google
 * Place Details (New) and streams it back to the browser. Nothing here is
 * stored — this is the on-view merge that keeps Google data out of our DB.
 *
 * Returns { details: { [placeId]: {...} } }. A place_id that errors or 404s is
 * simply omitted from the map (the row still renders from stored fields).
 */
export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  let body: { placeIds?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ids = Array.isArray(body.placeIds)
    ? [...new Set(body.placeIds.filter((x): x is string => typeof x === "string" && !!x))].slice(
        0,
        MAX_IDS_PER_REQUEST
      )
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ details: {} });
  }

  const details: Record<
    string,
    {
      company: string;
      category: string;
      address: string;
      phone: string;
      website: string;
      googleMapsUrl: string;
      businessStatus: string;
      wa: string;
    }
  > = {};

  await mapLimit(ids, CONCURRENCY, async (pid) => {
    const d = await placeDetails(pid, apiKey);
    if (!d) return; // transient error / not found — leave it out
    details[pid] = {
      company: d.company,
      category: d.category,
      address: d.address,
      phone: d.phone,
      website: d.website,
      googleMapsUrl: d.googleMapsUrl,
      businessStatus: d.businessStatus,
      wa: waLink(d.phone),
    };
  });

  return NextResponse.json({ details });
}
