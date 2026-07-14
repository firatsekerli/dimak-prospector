import { eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { prospects } from "@/db/schema";
import { placeDetails } from "@/lib/places";

// Cap per invocation so a single run stays within the function timeout. A weekly
// cron chips away at the rest; each run refreshes the stalest first.
const MAX_PER_RUN = 300;

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
 * Re-fetch the Google-sourced fields for known prospects (the ≤30-day refresh
 * cache the Places terms require), delete permanently-closed ones, and re-stamp
 * content_refreshed_at. User data (status/notes/tags/emails) is never touched.
 *
 * `staleDays` (default 25) refreshes rows older than that so nothing exceeds 30
 * days between weekly runs; `all` forces every row.
 */
export async function refreshProspects(
  apiKey: string,
  opts: { staleDays?: number; all?: boolean } = {}
): Promise<{ checked: number; updated: number; removed: number; remaining: number }> {
  const db = getDb();
  const staleDays = opts.staleDays ?? 25;

  const rows = opts.all
    ? await db.select({ placeId: prospects.placeId }).from(prospects)
    : await db
        .select({ placeId: prospects.placeId })
        .from(prospects)
        .where(lt(prospects.contentRefreshedAt, sql`now() - (${staleDays} * interval '1 day')`));

  const allIds = rows.map((r) => r.placeId);
  const ids = allIds.slice(0, MAX_PER_RUN);

  const closed: string[] = [];
  let updated = 0;

  await mapLimit(ids, 8, async (pid) => {
    const d = await placeDetails(pid, apiKey);
    if (!d) return; // transient error / not found — leave it for next run
    if (d.businessStatus === "CLOSED_PERMANENTLY") {
      closed.push(pid);
      return;
    }
    await db
      .update(prospects)
      .set({
        company: d.company,
        category: d.category,
        address: d.address,
        phone: d.phone,
        website: d.website,
        rating: d.rating,
        reviews: d.reviews,
        googleMapsUrl: d.googleMapsUrl,
        updatedAt: sql`now()`,
        contentRefreshedAt: sql`now()`,
      })
      .where(eq(prospects.placeId, pid));
    updated++;
  });

  if (closed.length > 0) {
    await db.delete(prospects).where(inArray(prospects.placeId, closed));
  }

  return {
    checked: ids.length,
    updated,
    removed: closed.length,
    remaining: Math.max(0, allIds.length - ids.length),
  };
}
