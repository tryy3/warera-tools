CREATE TABLE `company_packs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`ttl_seconds` integer DEFAULT 600 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recommended_regions` (
	`item_code` text PRIMARY KEY NOT NULL,
	`region_id` text NOT NULL,
	`region_name` text,
	`bonus` real,
	`payload` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `regions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`country_code` text,
	`payload` text,
	`fetched_at` integer,
	`enqueued_at` integer NOT NULL
);
