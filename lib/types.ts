import type { City } from "./config";

export type Config = {
  cities: City[];
  segments: string[];
  terms: string[];
  statuses: string[];
};

// A stored lead from GET /api/prospects — only the fields we persist (place_id
// + the user's own data). Business content is NOT here; it is fetched live.
// Timestamps arrive as ISO strings over JSON.
export type ProspectRow = {
  placeId: string;
  segment: string | null;
  country: string | null;
  city: string | null;
  emails: string | null;
  status: string;
  notes: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProspectsResponse = {
  rows: ProspectRow[];
  total: number;
  allCountries: string[]; // distinct countries present in the whole table
};

// Live business content for one place_id from POST /api/prospects/details.
// Fetched from Google Place Details on view and never stored.
export type LiveDetails = {
  company: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  googleMapsUrl: string;
  businessStatus: string; // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | ""
  wa: string;
};

export type DetailsResponse = { details: Record<string, LiveDetails> };

// v3 — geography cascade (GET /api/geo, GET /api/geo/cities)
export type GeoCountry = { code: string; name: string; isoNumeric: number | null };
export type Continent = { code: string; name: string; countries: GeoCountry[] };
export type GeoResponse = { continents: Continent[] };
export type CityRow = { city: string; adminName: string; population: number | null };
export type CitiesResponse = { country: string; cities: CityRow[] };

// v2/v3 — steel-door import market intelligence for the selected country
export type MarketPoint = { period: number; importValue: number | null };

export type MarketResponse = {
  code: string; // ISO2
  country: string; // display name
  reporterCode: number | null; // UN M49 (null if unavailable)
  hsCode: string;
  latest: {
    year: number;
    importValue: number | null;
    prevYear: number | null;
    growthPct: number | null;
  } | null;
  series: MarketPoint[]; // ascending by year
  updatedAt: string | null;
};
