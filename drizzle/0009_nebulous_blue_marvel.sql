CREATE TABLE `company_work_stats` (
	`company_id` text NOT NULL,
	`daily_date` text NOT NULL,
	`automated_engine` real,
	`employee_prod` real,
	`self_work` real,
	`total` real,
	`wage` real,
	`payload` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`company_id`, `daily_date`)
);
--> statement-breakpoint
CREATE TABLE `mu_watch_reasons` (
	`mu_id` text NOT NULL,
	`reason` text NOT NULL,
	`source_id` text NOT NULL,
	`last_touched_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`mu_id`, `reason`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `player_watch_reasons` (
	`player_id` text NOT NULL,
	`reason` text NOT NULL,
	`source_id` text NOT NULL,
	`last_touched_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`player_id`, `reason`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text,
	`mu_id` text,
	`workplace_company_id` text,
	`payload` text,
	`fetched_at` integer
);
--> statement-breakpoint
CREATE TABLE `worker_work_stats` (
	`company_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`daily_date` text NOT NULL,
	`employee_prod` real,
	`total` real,
	`wage` real,
	`payload` text,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`company_id`, `worker_id`, `daily_date`)
);
--> statement-breakpoint
INSERT INTO mu_watch_reasons (mu_id, reason, source_id, last_touched_at, created_at)
SELECT id, 'manual', '', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM mus;
--> statement-breakpoint
INSERT INTO mu_watch_reasons (mu_id, reason, source_id, last_touched_at, created_at)
SELECT '69e5dc36f7b095e977052f7b', 'manual', '', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM mu_watch_reasons LIMIT 1);
