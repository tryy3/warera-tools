ALTER TABLE `countries` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `countries` ADD `synced_at` integer;
