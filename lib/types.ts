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
  rating: number | null;
  reviews: number | null;
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
};

// v2 — steel-door import market intelligence (GET /api/market)
export type MarketRow = {
  country: string;
  year: number | null; // latest year with data
  importValue: number | null; // USD
  prevYear: number | null; // year used for the growth comparison
  growthPct: number | null; // YoY % vs prevYear
};

export type MarketResponse = {
  markets: MarketRow[]; // ranked by importValue desc
  hsCode: string;
  updatedAt: string | null; // max fetched_at, ISO
};
