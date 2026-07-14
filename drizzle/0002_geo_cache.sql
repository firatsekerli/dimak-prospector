CREATE TABLE "geo_cities" (
	"country_code" text NOT NULL,
	"city" text NOT NULL,
	"admin_name" text,
	"population" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_cities_country_code_city_pk" PRIMARY KEY("country_code","city")
);
--> statement-breakpoint
CREATE TABLE "geo_countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"continent" text NOT NULL,
	"continent_name" text NOT NULL,
	"iso_numeric" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
