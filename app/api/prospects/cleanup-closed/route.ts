import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Run tasks with limited concurrency to stay within the function timeout and be
// gentle on the Places per-minute quota.
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

// Place Details (New) — request only businessStatus to keep cost minimal.
async function businessStatus(placeId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id,businessStatus" },
    });
    if (!res.ok) return null; // 404/error -> unknown, keep the row
    const d = (await res.json()) as { businessStatus?: string };
    return typeof d.businessStatus === "string" ? d.businessStatus : "";
  } catch {
    return null;
  }
}

/**
 * POST /api/prospects/cleanup-closed — re-checks every saved prospect against
 * Google Places and deletes the ones now marked CLOSED_PERMANENTLY. Makes one
 * billed Place Details call per prospect.
 */
export async function POST() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  const db = getDb();
  const rows = await db.select({ placeId: prospects.placeId }).from(prospects);
  const ids = rows.map((r) => r.placeId);

  if (ids.length === 0) return NextResponse.json({ checked: 0, removed: 0 });

  const statuses = await mapLimit(ids, 10, (id) => businessStatus(id, apiKey));
  const closed = ids.filter((_, i) => statuses[i] === "CLOSED_PERMANENTLY");

  if (closed.length > 0) {
    await db.delete(prospects).where(inArray(prospects.placeId, closed));
  }

  return NextResponse.json({ checked: ids.length, removed: closed.length });
}
