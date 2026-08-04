CREATE TABLE `item_market_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`money` real NOT NULL,
	`item_code` text NOT NULL,
	`quantity` integer NOT NULL,
	`seller_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`transaction_type` text NOT NULL,
	`item_id` text NOT NULL,
	`item_type` text,
	`item_state` integer,
	`item_max_state` integer,
	`item_quantity` integer,
	`item_last_acquisition_at` integer,
	`skills` text,
	`offer_created_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`payload` text,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_market_tx_item_code_created_at_idx` ON `item_market_transactions` (`item_code`,`created_at`);--> statement-breakpoint
CREATE INDEX `item_market_tx_created_at_idx` ON `item_market_transactions` (`created_at`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `max_runs` integer;