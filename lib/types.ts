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
