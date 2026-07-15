-- Prospector — full database setup in one file.
-- Run this ONCE against a fresh Neon database (SQL editor or psql) to create
-- every table. Idempotent: safe to re-run (uses IF NOT EXISTS). This is the
-- consolidated equivalent of the step-by-step migrations in ./drizzle.

-- Leads: only the Google place_id + the user's own data are stored. Business
-- content (name, phone, website, address, category) is fetched live, never saved.
CREATE TABLE IF NOT EXISTS "prospects" (
  "place_id"   text PRIMARY KEY,
  "segment"    text,
  "country"    text,
  "city"       text,
  "emails"     text,
  "status"     text NOT NULL DEFAULT 'New',
  "source"     text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Timestamped notes log (many per prospect), deleted with the prospect.
CREATE TABLE IF NOT EXISTS "prospect_notes" (
  "id"         serial PRIMARY KEY,
  "place_id"   text NOT NULL REFERENCES "prospects"("place_id") ON DELETE CASCADE,
  "body"       text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "prospect_notes_place_id_idx" ON "prospect_notes" ("place_id");

-- User-defined segment labels.
CREATE TABLE IF NOT EXISTS "segments" (
  "name"       text PRIMARY KEY,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Market intelligence cache (UN Comtrade import stats), per country-year-product.
CREATE TABLE IF NOT EXISTS "steel_door_imports" (
  "country"       text NOT NULL,
  "reporter_code" integer NOT NULL,
  "period"        integer NOT NULL,
  "hs_code"       text NOT NULL DEFAULT '730830',
  "import_value"  double precision,
  "quantity"      double precision,
  "is_mirror"     boolean NOT NULL DEFAULT false,
  "source"        text NOT NULL DEFAULT 'UN Comtrade',
  "fetched_at"    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("reporter_code", "period", "hs_code")
);

-- Geography cache (GeoNames): continents' countries and each country's top cities.
CREATE TABLE IF NOT EXISTS "geo_countries" (
  "code"           text PRIMARY KEY,
  "name"           text NOT NULL,
  "continent"      text NOT NULL,
  "continent_name" text NOT NULL,
  "iso_numeric"    integer,
  "fetched_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "geo_cities" (
  "country_code" text NOT NULL,
  "city"         text NOT NULL,
  "admin_name"   text,
  "population"   integer,
  "fetched_at"   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("country_code", "city")
);
