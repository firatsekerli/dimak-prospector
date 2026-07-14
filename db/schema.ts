import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

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
