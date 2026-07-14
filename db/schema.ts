import {
  pgTable,
  text,
  real,
  integer,
  timestamp,
  boolean,
  doublePrecision,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * `prospects` — one row per Google Places business, deduped by place_id.
 * Mirrors the data model in CLAUDE.md and the prototype's SQLite table in
 * reference/app.py. `segment` may hold several tags joined by " | ".
 * `status` and `notes` are user-owned and must never be clobbered on a re-find.
 */
export const prospects = pgTable("prospects", {
  placeId: text("place_id").primaryKey(), // Google Places id, the dedup key
  company: text("company"),
  segment: text("segment"),
  country: text("country"),
  city: text("city"),
  category: text("category"),
  address: text("address"),
  phone: text("phone"),
  website: text("website"),
  emails: text("emails"), // found addresses joined by " | "
  rating: real("rating"),
  reviews: integer("reviews"),
  googleMapsUrl: text("google_maps_url"),
  status: text("status").notNull().default("New"), // New | Contacted | Replied | Not a fit
  notes: text("notes").notNull().default(""),
  source: text("source"), // e.g. 'Google Places'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;

/**
 * v2 — steel-door (HS 730830) import statistics per Gulf country, from the free
 * UN Comtrade API (the source behind ITC TradeMap). Separate from `prospects`:
 * this is country-year market data, not company data. See docs/V2.md.
 * `import_value`/`quantity` use double precision (USD totals are far too large
 * for real/float4 without losing precision).
 */
export const steelDoorImports = pgTable(
  "steel_door_imports",
  {
    country: text("country").notNull(), // 'UAE', 'Saudi Arabia', ...
    reporterCode: integer("reporter_code").notNull(), // UN M49, e.g. 784
    period: integer("period").notNull(), // year, e.g. 2024
    hsCode: text("hs_code").notNull().default("730830"),
    importValue: doublePrecision("import_value"), // USD (primaryValue)
    quantity: doublePrecision("quantity"), // net weight / qty, nullable
    isMirror: boolean("is_mirror").notNull().default(false), // derived from partner data
    source: text("source").notNull().default("UN Comtrade"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reporterCode, t.period, t.hsCode] })]
);

export type SteelDoorImport = typeof steelDoorImports.$inferSelect;
export type NewSteelDoorImport = typeof steelDoorImports.$inferInsert;

/**
 * v3 — geography cache from GeoNames. `geo_countries` holds the supported
 * continents' countries (ISO2 + UN M49 numeric, used as the Places region code
 * and the Comtrade reporter code); `geo_cities` holds each country's top cities
 * by population. Cached so we hit GeoNames at most once per country.
 */
export const geoCountries = pgTable("geo_countries", {
  code: text("code").primaryKey(), // ISO 3166-1 alpha-2, e.g. 'AE'
  name: text("name").notNull(),
  continent: text("continent").notNull(), // 'AS' | 'EU' | 'AF' | ...
  continentName: text("continent_name").notNull(),
  isoNumeric: integer("iso_numeric"), // UN M49 (Comtrade reporter code)
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const geoCities = pgTable(
  "geo_cities",
  {
    countryCode: text("country_code").notNull(),
    city: text("city").notNull(),
    adminName: text("admin_name"),
    population: integer("population"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.countryCode, t.city] })]
);

export type GeoCountryRow = typeof geoCountries.$inferSelect;
export type GeoCityRow = typeof geoCities.$inferSelect;

/**
 * User-defined segments (labels the user creates and tags businesses with).
 * Distinct from `prospects.category` (Google's business-selected primary type).
 * A prospect's applied tags stay in `prospects.segment` (" | "-joined).
 */
export const segments = pgTable("segments", {
  name: text("name").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SegmentRow = typeof segments.$inferSelect;
