CREATE TABLE `countries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tax_rate` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `countries_name_unique` ON `countries` (`name`);