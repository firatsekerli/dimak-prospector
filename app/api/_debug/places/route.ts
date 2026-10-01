import { NextResponse } from "next/server";
import { JUNK_TYPES } from "@/lib/places";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * TEMPORARY diagnostic endpoint. Runs the raw Places text search and returns
 * exactly what Google gives us (name, primary type, all types, address) per
 * page, with a "kept"/"dropped" flag from the junk-type filter. Stores nothing.
 *
 * Use it (while logged in) to compare the API's output against the consumer
 * Google Search results, e.g.:
 *   /api/_debug/places?q=fire+door+supplier+in+berat&region=AL
 *   /api/_debug/places?q=fire+door+supplier+in+berat+albania&region=AL
 *   /api/_debug/places?q=fire+door+supplier&region=AL
 *
 * Delete once we've settled the search strategy.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "No API key on server." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const region = (searchParams.get("region") ?? "AL").toUpperCase();
  const maxPages = Math.min(Math.max(parseInt(searchParams.get("pages") ?? "3", 10) || 3, 1), 3);
  if (!q) return NextResponse.json({ error: "Pass ?q=" }, { status: 400 });

  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.primaryType",
    "places.primaryTypeDisplayName",
    "places.types",
    "places.formattedAddress",
    "places.businessStatus",
    "nextPageToken",
  ].join(",");

  const pages: Array<{
    page: number;
    count: number;
    kept: number;
    dropped: number;
    results: Array<{
      name: string;
      primaryType: string;
      primaryTypeLabel: string;
      types: string[];
      address: string;
      status: string;
      verdict: "kept" | "dropped(junk-type)";
    }>;
  }> = [];

  let token: string | null = null;
  let p = 0;
  let totalKept = 0;
  let totalDropped = 0;

  while (p < maxPages) {
    const body: Record<string, unknown> = { textQuery: q, regionCode: region, languageCode: "en" };
    if (token) body.pageToken = token;

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `Places ${res.status}: ${text.slice(0, 300)}`, pages }, { status: 502 });
    }

    const data = (await res.json()) as { places?: Array<Record<string, unknown>>; nextPageToken?: string };
    const results = (data.places ?? []).map((pl) => {
      const primaryType = (pl.primaryType as string) ?? "";
      const types = (pl.types as string[]) ?? [];
      const isJunk = primaryType ? JUNK_TYPES.has(primaryType) : types.some((t) => JUNK_TYPES.has(t));
      return {
        name: ((pl.displayName as { text?: string })?.text) ?? "",
        primaryType,
        primaryTypeLabel: ((pl.primaryTypeDisplayName as { text?: string })?.text) ?? "",
        types,
        address: (pl.formattedAddress as string) ?? "",
        status: (pl.businessStatus as string) ?? "",
        verdict: (isJunk ? "dropped(junk-type)" : "kept") as "kept" | "dropped(junk-type)",
      };
    });
    const kept = results.filter((r) => r.verdict === "kept").length;
    const dropped = results.length - kept;
    totalKept += kept;
    totalDropped += dropped;
    pages.push({ page: p + 1, count: results.length, kept, dropped, results });

    token = data.nextPageToken ?? null;
    p += 1;
    if (!token) break;
    await sleep(2000);
  }

  return NextResponse.json({
    query: q,
    region,
    pagesFetched: pages.length,
    totals: { returned: totalKept + totalDropped, kept: totalKept, dropped: totalDropped },
    pages,
  });
}
