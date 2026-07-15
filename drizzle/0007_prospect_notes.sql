CREATE TABLE "prospect_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_notes" ADD CONSTRAINT "prospect_notes_place_id_prospects_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."prospects"("place_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_notes_place_id_idx" ON "prospect_notes" USING btree ("place_id");--> statement-breakpoint
-- Preserve any existing single note as the first entry in the log.
INSERT INTO "prospect_notes" ("place_id", "body", "created_at")
SELECT "place_id", "notes", COALESCE("updated_at", now())
FROM "prospects"
WHERE "notes" IS NOT NULL AND trim("notes") <> '';--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN "notes";
