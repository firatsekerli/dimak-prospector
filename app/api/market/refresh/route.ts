import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { steelDoorImports, type NewSteelDoorImport } from "@/db/schema";
import { fetchSteelDoorImports, HS_STEEL_DOORS } from "@/lib/comtrade";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // ~30 sequential Comtrade calls

/**
 * POST /api/market/refresh — pulls the last few years of steel-door (HS 730830)
 * imports for the six Gulf countries from UN Comtrade and upserts them into
 * steel_door_imports. Gated by the auth middleware like every /api/* route.
 */
export async function POST() {
  const apiKey = process.env.COMTRADE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "COMTRADE_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 5, thisYear - 4, thisYear - 3, thisYear - 2, thisYear - 1];

  let records;
  try {
    records = await fetchSteelDoorImports(apiKey, years);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Comtrade error" },
      { status: 502 }
    );
  }

  if (records.length === 0) {
    return NextResponse.json({
      upserted: 0,
      years,
      note: "No data returned. Comtrade may not yet have these years, or the key/quota is exhausted.",
    });
  }

  // Dedupe by the primary key (defensive; construction already guarantees it).
  const seen = new Set<string>();
  const values: NewSteelDoorImport[] = [];
  for (const r of records) {
    const key = `${r.reporterCode}:${r.period}:${HS_STEEL_DOORS}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push({
      country: r.country,
      reporterCode: r.reporterCode,
      period: r.period,
      hsCode: HS_STEEL_DOORS,
      importValue: r.importValue,
      quantity: r.quantity,
      isMirror: false,
      source: "UN Comtrade",
    });
  }

  const db = getDb();
  await db
    .insert(steelDoorImports)
    .values(values)
    .onConflictDoUpdate({
      target: [steelDoorImports.reporterCode, steelDoorImports.period, steelDoorImports.hsCode],
      set: {
        country: sql`excluded.country`,
        importValue: sql`excluded.import_value`,
        quantity: sql`excluded.quantity`,
        isMirror: sql`excluded.is_mirror`,
        source: sql`excluded.source`,
        fetchedAt: sql`now()`,
      },
    });

  return NextResponse.json({
    upserted: values.length,
    years,
    countries: [...new Set(values.map((v) => v.country))],
  });
}
