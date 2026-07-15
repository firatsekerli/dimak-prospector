// Google Places (New) text search — server-side only.
// Preserves the exact field mask, pagination (max 3 pages, ~2s between token
// reuse), and phone preference (international ?? national) from reference/app.py.

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

const MAX_PAGES_PER_QUERY = 3;

export interface PlaceHit {
  placeId: string;
  company: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  googleMapsUrl: string;
  businessStatus: string; // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | ""
}

// Place Details (New) field mask — same fields, no "places." prefix (single place).
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "primaryTypeDisplayName",
  "googleMapsUri",
  "businessStatus",
].join(",");

/**
 * Fetch live details for a single known place_id (Place Details New). This is
 * the on-view lookup that renders business content in the browser without ever
 * storing it. Returns null on 404/error so the caller can skip that row.
 */
export async function placeDetails(placeId: string, apiKey: string): Promise<PlaceHit | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const p = (await res.json()) as Record<string, unknown>;
  const displayName = p.displayName as { text?: string } | undefined;
  const primaryType = p.primaryTypeDisplayName as { text?: string } | undefined;
  return {
    placeId: (p.id as string) ?? placeId,
    company: displayName?.text ?? "",
    category: primaryType?.text ?? "",
    address: (p.formattedAddress as string) ?? "",
    phone: (p.internationalPhoneNumber as string) ?? (p.nationalPhoneNumber as string) ?? "",
    website: (p.websiteUri as string) ?? "",
    googleMapsUrl: (p.googleMapsUri as string) ?? "",
    businessStatus: (p.businessStatus as string) ?? "",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one Places text search (with pagination) and return normalized hits.
 * Throws on a non-200 response so the caller can surface a 502.
 */
export async function placesSearch(
  query: string,
  region: string,
  apiKey: string
): Promise<PlaceHit[]> {
  const rows: PlaceHit[] = [];
  let token: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES_PER_QUERY) {
    const body: Record<string, unknown> = {
      textQuery: query,
      regionCode: region,
      languageCode: "en",
    };
    if (token) body.pageToken = token;

    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Places API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      places?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    };

    for (const p of data.places ?? []) {
      const displayName = p.displayName as { text?: string } | undefined;
      const primaryType = p.primaryTypeDisplayName as { text?: string } | undefined;
      rows.push({
        placeId: (p.id as string) ?? "",
        company: displayName?.text ?? "",
        category: primaryType?.text ?? "",
        address: (p.formattedAddress as string) ?? "",
        phone:
          (p.internationalPhoneNumber as string) ??
          (p.nationalPhoneNumber as string) ??
          "",
        website: (p.websiteUri as string) ?? "",
        googleMapsUrl: (p.googleMapsUri as string) ?? "",
        businessStatus: (p.businessStatus as string) ?? "",
      });
    }

    token = data.nextPageToken ?? null;
    pages += 1;
    if (!token) break;
    await sleep(2000); // token needs a moment to become valid
  }

  return rows;
}
