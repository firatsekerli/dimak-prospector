import type { City } from "./config";

export type Config = {
  cities: City[];
  segments: string[];
  terms: string[];
  statuses: string[];
};

// Shape of a row from GET /api/prospects (Drizzle columns + the wa link).
// Timestamps arrive as ISO strings over JSON.
export type ProspectRow = {
  placeId: string;
  company: string | null;
  segment: string | null;
  country: string | null;
  city: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  emails: string | null;
  googleMapsUrl: string | null;
  status: string;
  notes: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  wa: string;
};

export type ProspectsResponse = {
  rows: ProspectRow[];
  total: number;
  counts: Record<string, number>;
  allCountries: string[]; // distinct countries present in the whole table
  allCategories: string[]; // distinct Google categories present
};

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
