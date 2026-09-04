CREATE TABLE `user_profile_polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`user_count` integer DEFAULT 0 NOT NULL,
	`mu_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_profile_polls_status_recorded_at_idx` ON `user_profile_polls` (`status`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `user_profile_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`username` text,
	`avatar_url` text,
	`country_id` text,
	`mu_id` text,
	`company_id` text,
	`party_id` text,
	`is_active` integer,
	`last_connection_at` integer,
	`last_work_at` integer,
	`last_help_asked_at` integer,
	`last_daily_reward_claimed_at` integer,
	`last_company_joined_at` integer,
	`last_daily_calendar_claimed_at` integer,
	`last_skills_reset_at` integer,
	`level` integer,
	`total_xp` integer,
	`daily_xp_left` integer,
	`available_skill_points` integer,
	`spent_skill_points` integer,
	`total_skill_points` integer,
	`prestige_level` integer,
	`military_rank` integer,
	`is_premium` integer,
	`premium_months_count` integer,
	`created_at_game` integer,
	FOREIGN KEY (`poll_id`) REFERENCES `user_profile_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_profile_snapshots_user_recorded_at_idx` ON `user_profile_snapshots` (`user_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `user_profile_snapshots_poll_idx` ON `user_profile_snapshots` (`poll_id`);--> statement-breakpoint
CREATE INDEX `user_profile_snapshots_mu_recorded_at_idx` ON `user_profile_snapshots` (`mu_id`,`recorded_at`);