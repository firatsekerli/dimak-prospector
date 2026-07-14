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

export const SEGMENTS = [
  "Distributor / Trading",
  "Contractor (general / fit-out)",
  "Architect / Specifier",
  "Facility / FM",
];

export const TERM_SUGGESTIONS = [
  "fire door supplier",
  "fire rated door distributor",
  "steel door supplier",
  "doors and hardware supplier",
  "building materials trading company",
  "architectural hardware supplier",
  "fit out contractor",
  "interior fit out company",
  "joinery contractor",
  "general contracting company",
  "architecture firm",
  "architectural consultant",
  "facilities management company",
];

export const STATUSES = ["New", "Contacted", "Replied", "Not a fit"];
