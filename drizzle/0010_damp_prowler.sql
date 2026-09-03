CREATE TABLE `battle_loot_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`battle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mu_id` text NOT NULL,
	`total_dmg` real,
	`hits` integer,
	`total_money_from_bounty` real,
	`total_money_from_contract` real,
	`case1_count` integer,
	`case2_count` integer,
	`pool_loot` text,
	`payload` text,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `battle_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `battle_loot_snapshots_battle_user_poll_idx` ON `battle_loot_snapshots` (`battle_id`,`user_id`,`poll_id`);--> statement-breakpoint
CREATE INDEX `battle_loot_snapshots_mu_recorded_at_idx` ON `battle_loot_snapshots` (`mu_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `battle_polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`active_battle_pages` integer,
	`battle_count` integer DEFAULT 0 NOT NULL,
	`loot_snapshot_count` integer DEFAULT 0 NOT NULL,
	`finalized_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `battle_polls_status_recorded_at_idx` ON `battle_polls` (`status`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `battle_scoreboard_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`battle_id` text NOT NULL,
	`round_id` text,
	`round_number` integer,
	`round_is_active` integer,
	`attacker_points` real,
	`defender_points` real,
	`attacker_damages` real,
	`defender_damages` real,
	`attacker_hit_count` integer,
	`defender_hit_count` integer,
	`ticks_count` integer,
	`next_tick_at` integer,
	`round_started_at_game` integer,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `battle_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `battle_scoreboard_snapshots_battle_poll_idx` ON `battle_scoreboard_snapshots` (`battle_id`,`poll_id`);--> statement-breakpoint
CREATE INDEX `battle_scoreboard_snapshots_battle_recorded_at_idx` ON `battle_scoreboard_snapshots` (`battle_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `battles` (
	`id` text PRIMARY KEY NOT NULL,
	`war_id` text,
	`type` text,
	`is_active` integer DEFAULT true NOT NULL,
	`attacker_country_id` text,
	`defender_country_id` text,
	`attacker_region_id` text,
	`defender_region_id` text,
	`rounds_to_win` integer,
	`current_round_id` text,
	`current_round_number` integer,
	`attacker_won_rounds` integer,
	`defender_won_rounds` integer,
	`attacker_mu_orders` text,
	`defender_mu_orders` text,
	`sticky_mu_ids` text,
	`rounds_history` text,
	`started_at_game` integer,
	`ended_at` integer,
	`finalized_at` integer,
	`fetched_at` integer,
	`payload` text
);
--> statement-breakpoint
CREATE INDEX `battles_is_active_idx` ON `battles` (`is_active`);