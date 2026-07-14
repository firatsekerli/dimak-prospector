import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { steelDoorImports } from "@/db/schema";
import { GULF_REPORTERS, HS_STEEL_DOORS } from "@/lib/comtrade";
import type { MarketRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/market — for each Gulf country, the latest steel-door import value
 * and its YoY growth vs the most recent prior year with data. Ranked by latest
 * value (biggest importer first). Reads from Postgres only — no external call.
 */
export async function GET() {
  const db = getDb();
  const rows = (await db.select().from(steelDoorImports)).filter(
    (r) => r.hsCode === HS_STEEL_DOORS
  );

  const byCountry = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byCountry.get(r.country) ?? [];
    arr.push(r);
    byCountry.set(r.country, arr);
  }

  // Include every Gulf country, even those with no data yet.
  const countries = new Set<string>([
    ...GULF_REPORTERS.map((r) => r.country),
    ...byCountry.keys(),
  ]);

  const markets: MarketRow[] = [];
  for (const country of countries) {
    const withData = (byCountry.get(country) ?? [])
      .filter((r) => r.importValue != null)
      .sort((a, b) => b.period - a.period);

    if (withData.length === 0) {
      markets.push({ country, year: null, importValue: null, prevYear: null, growthPct: null });
      continue;
    }

    const current = withData[0];
    const previous = withData.find((r) => r.period < current.period) ?? null;
    const growthPct =
      previous && previous.importValue
        ? ((current.importValue! - previous.importValue) / previous.importValue) * 100
        : null;

    markets.push({
      country,
      year: current.period,
      importValue: current.importValue,
      prevYear: previous?.period ?? null,
      growthPct,
    });
  }

  markets.sort((a, b) => (b.importValue ?? -1) - (a.importValue ?? -1));

  const updatedAt = rows.reduce((max, r) => {
    const t = r.fetchedAt ? new Date(r.fetchedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  return NextResponse.json({
    markets,
    hsCode: HS_STEEL_DOORS,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  });
}
