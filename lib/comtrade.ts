// UN Comtrade client — server-side only. Pulls steel-door (HS 730830) import
// values per Gulf country. Free API; see docs/V2.md. One call per
// (reporter, year) keeps us safely within the free tier's per-call limits.

export const HS_STEEL_DOORS = "730830";

export const GULF_REPORTERS: { country: string; code: number }[] = [
  { country: "UAE", code: 784 },
  { country: "Saudi Arabia", code: 682 },
  { country: "Qatar", code: 634 },
  { country: "Kuwait", code: 414 },
  { country: "Oman", code: 512 },
  { country: "Bahrain", code: 48 },
];

const BASE = "https://comtradeapi.un.org/data/v1/get/C/A/HS"; // Commodities, Annual, HS
const FETCH_TIMEOUT_MS = 15000;

type RawRow = {
  primaryValue?: number;
  netWgt?: number;
  qty?: number;
  period?: number | string;
  reporterCode?: number;
};

export interface ImportRecord {
  country: string;
  reporterCode: number;
  period: number;
  importValue: number | null; // USD
  quantity: number | null; // net weight (kg) when available
}

async function callComtrade(
  apiKey: string,
  reporterCode: number,
  year: number
): Promise<RawRow[]> {
  const url = new URL(BASE);
  url.searchParams.set("reporterCode", String(reporterCode));
  url.searchParams.set("period", String(year));
  url.searchParams.set("partnerCode", "0"); // World
  url.searchParams.set("flowCode", "M"); // imports
  url.searchParams.set("cmdCode", HS_STEEL_DOORS);
  url.searchParams.set("subscription-key", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Comtrade ${res.status}: ${text.slice(0, 180)}`);
    }
    const json = (await res.json()) as { data?: RawRow[] | null };
    return Array.isArray(json?.data) ? json.data : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch steel-door imports for every Gulf reporter across the given years.
 * Returns at most one record per (reporter, year) — the World aggregate, which
 * is the row with the largest value when the API includes any breakdowns.
 */
export async function fetchSteelDoorImports(
  apiKey: string,
  years: number[]
): Promise<ImportRecord[]> {
  const out: ImportRecord[] = [];

  for (const reporter of GULF_REPORTERS) {
    for (const year of years) {
      const rows = await callComtrade(apiKey, reporter.code, year);
      if (rows.length === 0) continue;

      let best: RawRow | null = null;
      for (const row of rows) {
        const v = typeof row.primaryValue === "number" ? row.primaryValue : -1;
        if (!best || v > (best.primaryValue ?? -1)) best = row;
      }
      if (!best) continue;

      out.push({
        country: reporter.country,
        reporterCode: reporter.code,
        period: Number(best.period ?? year),
        importValue: typeof best.primaryValue === "number" ? best.primaryValue : null,
        quantity:
          typeof best.netWgt === "number"
            ? best.netWgt
            : typeof best.qty === "number"
              ? best.qty
              : null,
      });
    }
  }

  return out;
}
