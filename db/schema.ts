import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  boolean,
  doublePrecision,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/**
 * `prospects` — one saved lead, keyed by the Google Places `place_id`.
 *
 * Google's Maps Platform terms permit storing the `place_id` indefinitely but
 * NOT caching the business content (name, phone, website, address, category)
 * beyond the narrow lat/lng exception. So this table stores ONLY:
 *   - the place_id (the permanent, storable dedup key),
 *   - the search context the USER supplied (country + city they searched),
 *   - the user's own pipeline data (segment tags, status, notes),
 *   - emails we extracted from the company's own public website (not Google).
 *
 * The business name, phone, website, address and category are never stored;
 * they are fetched live from Place Details when a row is shown (see
 * /api/prospects/details). `status`/`notes`/`segment` are user-owned and must
 * never be clobbered on a re-find.
 */
export const prospects = pgTable("prospects", {
  placeId: text("place_id").primaryKey(), // Google Places id — storable indefinitely
  segment: text("segment"), // user-defined tags, " | "-joined
  country: text("country"), // the country the user searched (their input, not Google's)
  city: text("city"), // the city the user searched
  emails: text("emails"), // extracted from the company website (our data), " | "-joined
  status: text("status").notNull().default("New"), // New | Contacted | Replied | Not a fit
  source: text("source"), // e.g. 'Google Places'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;

/**
 * `prospect_notes` — a timestamped log of notes for a prospect. Replaces the old
 * single free-text `notes` column so the user can leave several dated notes over
 * time (and see when each was written). Deleted with its prospect (cascade).
 */
export const prospectNotes = pgTable(
  "prospect_notes",
  {
    id: serial("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => prospects.placeId, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prospect_notes_place_id_idx").on(t.placeId)]
);

export type ProspectNoteRow = typeof prospectNotes.$inferSelect;
export type NewProspectNote = typeof prospectNotes.$inferInsert;

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
 * Distinct from a business's Google category (which is fetched live, not stored).
 * A prospect's applied tags stay in `prospects.segment` (" | "-joined).
 */
export const segments = pgTable("segments", {
  name: text("name").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SegmentRow = typeof segments.$inferSelect;
