CREATE TABLE "alliances" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"core_development" double precision,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "core_development" double precision;--> statement-breakpoint
ALTER TABLE "countries" ADD COLUMN "alliance_id" text;