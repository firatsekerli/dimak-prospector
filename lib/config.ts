// Single source of truth for the search config lists (exposed via /api/config).
// Mirrors reference/app.py exactly. Edit here to change cities/segments/terms.

export type City = { city: string; country: string; region: string };

export const CITIES: City[] = [
  { city: "Dubai", country: "UAE", region: "AE" },
  { city: "Abu Dhabi", country: "UAE", region: "AE" },
  { city: "Sharjah", country: "UAE", region: "AE" },
  { city: "Riyadh", country: "Saudi Arabia", region: "SA" },
  { city: "Jeddah", country: "Saudi Arabia", region: "SA" },
  { city: "Dammam", country: "Saudi Arabia", region: "SA" },
  { city: "Doha", country: "Qatar", region: "QA" },
  { city: "Kuwait City", country: "Kuwait", region: "KW" },
  { city: "Muscat", country: "Oman", region: "OM" },
  { city: "Manama", country: "Bahrain", region: "BH" },
];

// Generic starter labels/terms. Segments are user-defined at runtime (stored in
// the DB); these are just neutral fallbacks exposed by /api/config.
export const SEGMENTS = [
  "Distributor / Trading",
  "Contractor",
  "Specifier",
  "Facility / FM",
];

export const TERM_SUGGESTIONS = [
  "distributor",
  "trading company",
  "wholesaler",
  "supplier",
  "importer",
  "contractor",
  "general contracting company",
  "consultant",
  "manufacturer",
];

export const STATUSES = ["New", "Contacted", "Replied", "Not a fit"];
