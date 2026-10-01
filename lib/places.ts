// Google Places (New) — server-side only.
//
// Billing note: Place Details is charged by the tier of fields requested.
//   - name / category / maps link / open-closed  → "Pro" tier (free allowance)
//   - phone / website                            → "Enterprise" (contact) tier — billed
// So we split the two: basic fields are fetched for every row on view (cheap),
// and contact fields only on demand, per lead the user actually pursues.

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

// Search needs the id (to store), businessStatus (to skip closed) and the
// business type (to drop irrelevant padding — see JUNK_TYPES). `businessStatus`
// already puts this call on the Pro SKU, so adding `primaryType`/`types` costs
// nothing extra. Everything else (name, phone, website) is fetched live.
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
  "nextPageToken",
].join(",");

/**
 * Google business types that are never fire-door buyers. The Places text search
 * ranks real matches first, then pads the tail of deep pages with prominent but
 * unrelated local places (a church, a campground, a hotel). Google's own UI
 * hides that tail; we drop it here by primary type so it never becomes a lead.
 *
 * This is a DENYLIST (drop these, keep everything else) so we never accidentally
 * hide a real supplier Google mis-typed. Edit freely to tune per market — the
 * strings are Google Places "Table A" type ids (e.g. `church`, `campground`).
 */
export const JUNK_TYPES = new Set<string>([
  // Places of worship
  "church", "mosque", "synagogue", "hindu_temple", "place_of_worship",
  // Lodging
  "lodging", "hotel", "motel", "inn", "hostel", "guest_house", "bed_and_breakfast",
  "resort_hotel", "extended_stay_hotel", "campground", "camping_cabin", "rv_park",
  "cottage", "farmstay",
  // Food & drink
  "restaurant", "bar", "cafe", "coffee_shop", "bakery", "fast_food_restaurant",
  "meal_delivery", "meal_takeaway", "night_club", "food",
  // Tourism / culture / leisure
  "tourist_attraction", "historical_landmark", "historical_place", "monument",
  "museum", "art_gallery", "cultural_landmark", "amusement_park", "aquarium",
  "zoo", "national_park", "park", "botanical_garden", "stadium",
  // Education
  "school", "primary_school", "secondary_school", "preschool", "university",
  // Health (end-users at best, not resale leads)
  "hospital", "pharmacy", "drugstore", "dentist", "doctor", "veterinary_care",
  // Personal services / retail that don't buy fire doors
  "gym", "spa", "beauty_salon", "hair_salon", "gas_station", "atm", "bank",
  "supermarket", "grocery_store", "convenience_store",
]);

/** True if a place's primary type (or, lacking one, any of its types) is junk. */
function isJunk(primaryType: string, types: string[]): boolean {
  if (primaryType) return JUNK_TYPES.has(primaryType);
  return types.some((t) => JUNK_TYPES.has(t));
}

// Basic details — Pro tier (free within the monthly allowance). No phone/website.
// `addressComponents` (also Pro) lets us show the business's REAL city, rather
// than the city the user happened to search under.
const BASIC_FIELD_MASK = [
  "id",
  "displayName",
  "primaryTypeDisplayName",
  "googleMapsUri",
  "businessStatus",
  "addressComponents",
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
  city: string;
  googleMapsUrl: string;
  businessStatus: string;
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

// Pull the business's city from Google's structured address components, trying
// the most city-like type first and falling back through broader ones.
function cityFromComponents(components: AddressComponent[]): string {
  const prefer = ["locality", "postal_town", "administrative_area_level_2", "sublocality", "administrative_area_level_1"];
  for (const t of prefer) {
    const hit = components.find((c) => (c.types ?? []).includes(t));
    if (hit?.longText) return hit.longText;
  }
  return "";
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
  const components = (p.addressComponents as AddressComponent[]) ?? [];
  return {
    placeId: (p.id as string) ?? placeId,
    company: displayName?.text ?? "",
    category: primaryType?.text ?? "",
    city: cityFromComponents(components),
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

    // Keep only relevant results: drop junk business types (church, hotel, …).
    // Google ranks real matches first, so the junk clusters in the tail of the
    // deep pages — this is where the churches/campgrounds were coming from.
    let keptThisPage = 0;
    for (const p of data.places ?? []) {
      const placeId = (p.id as string) ?? "";
      if (!placeId) continue;
      const primaryType = (p.primaryType as string) ?? "";
      const types = (p.types as string[]) ?? [];
      if (isJunk(primaryType, types)) continue;
      rows.push({ placeId, businessStatus: (p.businessStatus as string) ?? "" });
      keptThisPage += 1;
    }

    token = data.nextPageToken ?? null;
    pages += 1;
    if (!token) break;
    // Thin market: once a whole page is padding (nothing relevant survived the
    // filter), the next pages are only more padding — stop instead of paying for
    // them. Rich markets keep a steady stream of real results and page on.
    if (keptThisPage === 0) break;
    await sleep(2000); // token needs a moment to become valid
  }

  return rows;
}
