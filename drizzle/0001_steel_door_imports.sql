CREATE TABLE "steel_door_imports" (
	"country" text NOT NULL,
	"reporter_code" integer NOT NULL,
	"period" integer NOT NULL,
	"hs_code" text DEFAULT '730830' NOT NULL,
	"import_value" double precision,
	"quantity" double precision,
	"is_mirror" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'UN Comtrade' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "steel_door_imports_reporter_code_period_hs_code_pk" PRIMARY KEY("reporter_code","period","hs_code")
);
