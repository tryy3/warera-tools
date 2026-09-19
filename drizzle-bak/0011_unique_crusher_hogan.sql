CREATE TABLE `country_watch_reasons` (
	`country_id` text NOT NULL,
	`reason` text NOT NULL,
	`source_id` text NOT NULL,
	`last_touched_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`country_id`, `reason`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `donation_polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`scope_count` integer DEFAULT 0 NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `donation_polls_status_recorded_at_idx` ON `donation_polls` (`status`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `donation_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`user_id` text NOT NULL,
	`donation_row_id` text,
	`amount` real,
	`donation_created_at` integer,
	`donation_updated_at` integer,
	`payload` text,
	FOREIGN KEY (`poll_id`) REFERENCES `donation_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `donation_snapshots_scope_user_poll_idx` ON `donation_snapshots` (`scope_type`,`scope_id`,`user_id`,`poll_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `country_watch_reasons` (`country_id`, `reason`, `source_id`, `last_touched_at`, `created_at`)
VALUES ('6813b6d446e731854c7ac7f2', 'manual', '', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000));