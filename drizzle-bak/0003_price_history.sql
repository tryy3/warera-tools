CREATE TABLE `price_polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`item_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`item_code` text NOT NULL,
	`market_price` real,
	`buy_min` real,
	`buy_max` real,
	`buy_avg` real,
	`sell_min` real,
	`sell_max` real,
	`sell_avg` real,
	FOREIGN KEY (`poll_id`) REFERENCES `price_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_snapshots_poll_item_uidx` ON `price_snapshots` (`poll_id`,`item_code`);
--> statement-breakpoint
CREATE INDEX `price_snapshots_item_code_idx` ON `price_snapshots` (`item_code`);
