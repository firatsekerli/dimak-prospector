// Google Places (New) — server-side only.
//
// Billing note: Place Details is charged by the tier of fields requested.
//   - name / category / maps link / open-closed  → "Pro" tier (free allowance)
//   - phone / website                            → "Enterprise" (contact) tier — billed
// So we split the two: basic fields are fetched for every row on view (cheap),
// and contact fields only on demand, per lead the user actually pursues.

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

// Search only needs the id (to store) and businessStatus (to skip closed) —
// everything else is fetched live, so keep this at the cheapest tier.
const SEARCH_FIELD_MASK = ["places.id", "places.businessStatus", "nextPageToken"].join(",");

// Basic details — Pro tier (free within the monthly allowance). No phone/website.
const BASIC_FIELD_MASK = [
  "id",
  "displayName",
  "primaryTypeDisplayName",
  "googleMapsUri",
  "businessStatus",
].join(",");

// Contact details — Enterprise/contact tier (billed). Fetched only on demand.
const CONTACT_FIELD_MASK = ["id", "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri"].join(",");

const MAX_PAGES_PER_QUERY = 3;

export interface SearchHit {
  placeId: string;
  businessStatus: string;
}
export interface BasicPlace {
  placeId: string;
  company: string;
  category: string;
  googleMapsUrl: string;
  businessStatus: string;
}
export interface ContactInfo {
  phone: string;
  website: string;
}

async function fetchPlace(
  placeId: string,
  apiKey: string,
  fieldMask: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

/** Basic, cheap details for the list view (Pro tier — no phone/website). */
export async function placeBasic(placeId: string, apiKey: string): Promise<BasicPlace | null> {
  const p = await fetchPlace(placeId, apiKey, BASIC_FIELD_MASK);
  if (!p) return null;
  const displayName = p.displayName as { text?: string } | undefined;
  const primaryType = p.primaryTypeDisplayName as { text?: string } | undefined;
  return {
    placeId: (p.id as string) ?? placeId,
    company: displayName?.text ?? "",
    category: primaryType?.text ?? "",
    googleMapsUrl: (p.googleMapsUri as string) ?? "",
    businessStatus: (p.businessStatus as string) ?? "",
  };
}

/** Contact details — Enterprise/contact tier (billed). On demand only. */
export async function placeContact(placeId: string, apiKey: string): Promise<ContactInfo | null> {
  const p = await fetchPlace(placeId, apiKey, CONTACT_FIELD_MASK);
  if (!p) return null;
  return {
    phone: (p.internationalPhoneNumber as string) ?? (p.nationalPhoneNumber as string) ?? "",
    website: (p.websiteUri as string) ?? "",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one Places text search (with pagination) and return id + businessStatus
 * per hit. Throws on a non-200 response so the caller can surface a 502.
 */
export async function placesSearch(query: string, region: string, apiKey: string): Promise<SearchHit[]> {
  const rows: SearchHit[] = [];
  let token: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES_PER_QUERY) {
    const body: Record<string, unknown> = { textQuery: query, regionCode: region, languageCode: "en" };
    if (token) body.pageToken = token;

    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
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
      rows.push({
        placeId: (p.id as string) ?? "",
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
