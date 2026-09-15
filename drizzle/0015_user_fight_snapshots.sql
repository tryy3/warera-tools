CREATE TABLE `user_fight_polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`user_count` integer DEFAULT 0 NOT NULL,
	`mu_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_fight_polls_status_recorded_at_idx` ON `user_fight_polls` (`status`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `user_fight_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`mu_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`username` text NOT NULL,
	`level` integer NOT NULL,
	`military_rank_bonus` real NOT NULL,
	`ammo_label` text,
	`pill_label` text,
	`pill_ends_at` integer,
	`skill_levels` text NOT NULL,
	`last_skills_reset_at` integer,
	`avatar_url` text,
	`atk` real NOT NULL,
	`precision` real NOT NULL,
	`crit_chance` real NOT NULL,
	`crit_damage` real NOT NULL,
	`armor` real NOT NULL,
	`dodge` real NOT NULL,
	`hp` real NOT NULL,
	`max_hp` real NOT NULL,
	`hunger` real NOT NULL,
	`max_hunger` real NOT NULL,
	`hp_regen_per_hour` real NOT NULL,
	`hunger_regen_per_hour` real NOT NULL,
	`pill_status` text NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `user_fight_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_fight_snapshots_user_recorded_at_idx` ON `user_fight_snapshots` (`user_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `user_fight_snapshots_poll_idx` ON `user_fight_snapshots` (`poll_id`);--> statement-breakpoint
CREATE INDEX `user_fight_snapshots_mu_recorded_at_idx` ON `user_fight_snapshots` (`mu_id`,`recorded_at`);