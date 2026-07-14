import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { steelDoorImports, type NewSteelDoorImport } from "@/db/schema";
import { fetchImportsForReporter, HS_STEEL_DOORS } from "@/lib/comtrade";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/market/refresh  body { reporterCode, country }
 * Pulls the last few years of steel-door (HS 730830) imports for ONE country
 * (the selected one) from UN Comtrade and upserts them. One Comtrade call.
 */
export async function POST(request: Request) {
  const apiKey = process.env.COMTRADE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "COMTRADE_API_KEY is not set on the server." },
      { status: 400 }
    );
  }

  let body: { reporterCode?: number; country?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const reporterCode = Number(body.reporterCode);
  const country = (body.country ?? "").trim();
  if (!Number.isInteger(reporterCode) || reporterCode <= 0) {
    return NextResponse.json({ error: "A valid reporterCode is required." }, { status: 400 });
  }
  if (!country) {
    return NextResponse.json({ error: "A country name is required." }, { status: 400 });
  }

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 5, thisYear - 4, thisYear - 3, thisYear - 2, thisYear - 1];

  let records;
  try {
    records = await fetchImportsForReporter(apiKey, reporterCode, years);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Comtrade error";
    if (msg.includes("429")) {
      return NextResponse.json(
        { error: "UN Comtrade rate limit hit — wait ~30 seconds and click Refresh again." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (records.length === 0) {
    return NextResponse.json({
      upserted: 0,
      country,
      years,
      note: "No data returned for these years — Comtrade may not have them yet.",
    });
  }

  const values: NewSteelDoorImport[] = records.map((r) => ({
    country,
    reporterCode,
    period: r.period,
    hsCode: HS_STEEL_DOORS,
    importValue: r.importValue,
    quantity: r.quantity,
    isMirror: false,
    source: "UN Comtrade",
  }));

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

  return NextResponse.json({ upserted: values.length, country, years });
}
