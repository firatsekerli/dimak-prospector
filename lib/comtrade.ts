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
const FETCH_TIMEOUT_MS = 25000;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A SINGLE Comtrade call for all reporters and all years (comma-separated), so
 * the free-tier burst rate limit can't be tripped. Retries a couple of times
 * with backoff if a 429 does occur (e.g. a lingering limit window).
 */
async function callComtrade(apiKey: string, reporterCodes: number[], years: number[]): Promise<RawRow[]> {
  const url = new URL(BASE);
  url.searchParams.set("reporterCode", reporterCodes.join(","));
  url.searchParams.set("period", years.join(","));
  url.searchParams.set("partnerCode", "0"); // World
  url.searchParams.set("flowCode", "M"); // imports
  url.searchParams.set("cmdCode", HS_STEEL_DOORS);
  url.searchParams.set("subscription-key", apiKey);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429 && attempt < maxAttempts) {
      await sleep(5000 * attempt); // 5s, then 10s
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Comtrade ${res.status}: ${text.slice(0, 180)}`);
    }
    const json = (await res.json()) as { data?: RawRow[] | null };
    return Array.isArray(json?.data) ? json.data : [];
  }
  throw new Error("Comtrade 429: rate limit — try again in ~30 seconds.");
}

export interface ImportYear {
  period: number;
  importValue: number | null;
  quantity: number | null;
}

/**
 * Fetch steel-door imports for ONE reporter across the given years (single call).
 * One record per year — the World aggregate (largest value if breakdowns exist).
 */
export async function fetchImportsForReporter(
  apiKey: string,
  reporterCode: number,
  years: number[]
): Promise<ImportYear[]> {
  const rows = await callComtrade(apiKey, [reporterCode], years);

  const best = new Map<number, RawRow>();
  for (const row of rows) {
    const period = Number(row.period);
    if (!Number.isFinite(period)) continue;
    const cur = best.get(period);
    const v = typeof row.primaryValue === "number" ? row.primaryValue : -1;
    if (!cur || v > (cur.primaryValue ?? -1)) best.set(period, row);
  }

  return [...best.entries()]
    .map(([period, row]) => ({
      period,
      importValue: typeof row.primaryValue === "number" ? row.primaryValue : null,
      quantity:
        typeof row.netWgt === "number"
          ? row.netWgt
          : typeof row.qty === "number"
            ? row.qty
            : null,
    }))
    .sort((a, b) => a.period - b.period);
}

/**
 * Fetch steel-door imports for every Gulf reporter across the given years in one
 * request. Returns at most one record per (reporter, year) — the World
 * aggregate, i.e. the row with the largest value when breakdowns are present.
 */
export async function fetchSteelDoorImports(apiKey: string, years: number[]): Promise<ImportRecord[]> {
  const rows = await callComtrade(apiKey, GULF_REPORTERS.map((r) => r.code), years);

  // Keep the largest value per (reporter, period).
  const best = new Map<string, RawRow>();
  for (const row of rows) {
    if (row.reporterCode == null) continue;
    const period = Number(row.period);
    if (!Number.isFinite(period)) continue;
    const key = `${row.reporterCode}:${period}`;
    const cur = best.get(key);
    const v = typeof row.primaryValue === "number" ? row.primaryValue : -1;
    if (!cur || v > (cur.primaryValue ?? -1)) best.set(key, row);
  }

  const out: ImportRecord[] = [];
  for (const [key, row] of best) {
    const reporterCode = Number(key.split(":")[0]);
    const reporter = GULF_REPORTERS.find((r) => r.code === reporterCode);
    if (!reporter) continue;
    out.push({
      country: reporter.country,
      reporterCode,
      period: Number(row.period),
      importValue: typeof row.primaryValue === "number" ? row.primaryValue : null,
      quantity:
        typeof row.netWgt === "number"
          ? row.netWgt
          : typeof row.qty === "number"
            ? row.qty
            : null,
    });
  }
  return out;
}
