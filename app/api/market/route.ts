import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { steelDoorImports, geoCountries } from "@/db/schema";
import { HS_STEEL_DOORS } from "@/lib/comtrade";

export const dynamic = "force-dynamic";

/**
 * GET /api/market?country=XX — the selected country's steel-door (HS 730830)
 * import series, latest value, and YoY growth. Reads Postgres only.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = (params.get("country") ?? "").toUpperCase();
  const hsCode = (params.get("hsCode") ?? HS_STEEL_DOORS).trim();
  if (!/^[A-Z]{2}$/.test(code)) {
    return NextResponse.json({ error: "A 2-letter country code is required." }, { status: 400 });
  }
  if (!/^\d{2,6}$/.test(hsCode)) {
    return NextResponse.json({ error: "Product code must be a 2–6 digit HS code." }, { status: 400 });
  }

  const db = getDb();
  const [geo] = await db.select().from(geoCountries).where(eq(geoCountries.code, code)).limit(1);
  const reporterCode = geo?.isoNumeric ?? null;
  const country = geo?.name ?? code;

  const empty = {
    code,
    country,
    reporterCode,
    hsCode,
    latest: null,
    series: [],
    updatedAt: null,
  };
  if (reporterCode == null) return NextResponse.json(empty);

  const rows = await db
    .select()
    .from(steelDoorImports)
    .where(
      and(
        eq(steelDoorImports.reporterCode, reporterCode),
        eq(steelDoorImports.hsCode, hsCode)
      )
    );

  if (rows.length === 0) return NextResponse.json(empty);

  const withData = rows
    .filter((r) => r.importValue != null)
    .sort((a, b) => a.period - b.period);
  const series = withData.map((r) => ({ period: r.period, importValue: r.importValue }));

  let latest: MarketLatest = null;
  if (withData.length > 0) {
    const current = withData[withData.length - 1];
    const previous = [...withData].reverse().find((r) => r.period < current.period) ?? null;
    const growthPct =
      previous && previous.importValue
        ? ((current.importValue! - previous.importValue) / previous.importValue) * 100
        : null;
    latest = {
      year: current.period,
      importValue: current.importValue,
      prevYear: previous?.period ?? null,
      growthPct,
    };
  }

  const updatedAt = rows.reduce((max, r) => {
    const t = r.fetchedAt ? new Date(r.fetchedAt).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  return NextResponse.json({
    code,
    country,
    reporterCode,
    hsCode,
    latest,
    series,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  });
}

type MarketLatest = {
  year: number;
  importValue: number | null;
  prevYear: number | null;
  growthPct: number | null;
} | null;
