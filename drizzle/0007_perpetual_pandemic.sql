CREATE TABLE `mus` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`avatar_url` text,
	`country_id` text,
	`region_id` text,
	`owner_user_id` text,
	`mercenary_reputation` real,
	`level` integer,
	`created_at_game` integer,
	`roles` text,
	`active_upgrade_levels` text,
	`payload` text,
	`enqueued_at` integer NOT NULL,
	`fetched_at` integer
);
--> statement-breakpoint
CREATE TABLE `mu_members` (
	`mu_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`mu_id`, `user_id`),
	FOREIGN KEY (`mu_id`) REFERENCES `mus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mu_polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`mu_count` integer DEFAULT 0 NOT NULL,
	`member_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mu_polls_status_recorded_at_idx` ON `mu_polls` (`status`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `mu_stat_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`mu_id` text NOT NULL,
	`weekly_damages` real,
	`weekly_damages_rank` integer,
	`weekly_damages_tier` text,
	`bounty` real,
	`bounty_rank` integer,
	`bounty_tier` text,
	`reputation` real,
	`reputation_rank` integer,
	`reputation_tier` text,
	`damages` real,
	`damages_rank` integer,
	`damages_tier` text,
	`terrain` real,
	`terrain_rank` integer,
	`terrain_tier` text,
	`wealth` real,
	`wealth_rank` integer,
	`wealth_tier` text,
	`leveling_level` integer,
	`leveling_monthly_damages` real,
	`payload` text,
	FOREIGN KEY (`poll_id`) REFERENCES `mu_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mu_stat_snapshots_mu_poll_idx` ON `mu_stat_snapshots` (`mu_id`,`poll_id`);--> statement-breakpoint
CREATE TABLE `mu_member_stat_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`mu_id` text NOT NULL,
	`user_id` text NOT NULL,
	`member_row_id` text,
	`total_damages_count` integer,
	`monthly_damages_count` integer,
	`weekly_damages_count` integer,
	`total_help_count` integer,
	`monthly_help_count` integer,
	`weekly_help_count` integer,
	`payload` text,
	FOREIGN KEY (`poll_id`) REFERENCES `mu_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mu_member_stat_snapshots_mu_user_poll_idx` ON `mu_member_stat_snapshots` (`mu_id`,`user_id`,`poll_id`);
