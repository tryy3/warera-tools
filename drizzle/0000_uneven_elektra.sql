CREATE TYPE "public"."job_status" AS ENUM('success', 'error', 'running');--> statement-breakpoint
CREATE TYPE "public"."poll_status" AS ENUM('success', 'partial', 'error');--> statement-breakpoint
CREATE TABLE "battle_loot_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"battle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mu_id" text NOT NULL,
	"total_dmg" double precision,
	"hits" integer,
	"total_money_from_bounty" numeric(20, 6),
	"total_money_from_contract" numeric(20, 6),
	"case1_count" integer,
	"case2_count" integer,
	"pool_loot" jsonb,
	"payload" jsonb,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" "poll_status" NOT NULL,
	"error" text,
	"active_battle_pages" integer,
	"battle_count" integer DEFAULT 0 NOT NULL,
	"loot_snapshot_count" integer DEFAULT 0 NOT NULL,
	"finalized_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_scoreboard_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"battle_id" text NOT NULL,
	"round_id" text,
	"round_number" integer,
	"round_is_active" boolean,
	"attacker_points" double precision,
	"defender_points" double precision,
	"attacker_damages" double precision,
	"defender_damages" double precision,
	"attacker_hit_count" integer,
	"defender_hit_count" integer,
	"ticks_count" integer,
	"next_tick_at" timestamp with time zone,
	"round_started_at_game" timestamp with time zone,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" text PRIMARY KEY NOT NULL,
	"war_id" text,
	"type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"attacker_country_id" text,
	"defender_country_id" text,
	"attacker_region_id" text,
	"defender_region_id" text,
	"rounds_to_win" integer,
	"current_round_id" text,
	"current_round_number" integer,
	"attacker_won_rounds" integer,
	"defender_won_rounds" integer,
	"attacker_mu_orders" jsonb,
	"defender_mu_orders" jsonb,
	"sticky_mu_ids" jsonb,
	"rounds_history" jsonb,
	"started_at_game" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"ttl_seconds" integer NOT NULL,
	"tags" text
);
--> statement-breakpoint
CREATE TABLE "company_packs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"ttl_seconds" integer DEFAULT 600 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_work_stats" (
	"company_id" text NOT NULL,
	"daily_date" text NOT NULL,
	"automated_engine" double precision,
	"employee_prod" double precision,
	"self_work" double precision,
	"total" double precision,
	"wage" numeric(20, 6),
	"payload" jsonb,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "company_work_stats_company_id_daily_date_pk" PRIMARY KEY("company_id","daily_date")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tax_rate" double precision NOT NULL,
	"iso_code" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "countries_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "country_watch_reasons" (
	"country_id" text NOT NULL,
	"reason" text NOT NULL,
	"source_id" text NOT NULL,
	"last_touched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "country_watch_reasons_country_id_reason_source_id_pk" PRIMARY KEY("country_id","reason","source_id")
);
--> statement-breakpoint
CREATE TABLE "donation_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" "poll_status" NOT NULL,
	"error" text,
	"scope_count" integer DEFAULT 0 NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"user_id" text NOT NULL,
	"donation_row_id" text,
	"amount" numeric(20, 6),
	"donation_created_at" timestamp with time zone,
	"donation_updated_at" timestamp with time zone,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "item_market_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"money" numeric(20, 6) NOT NULL,
	"item_code" text NOT NULL,
	"quantity" integer NOT NULL,
	"seller_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"item_id" text NOT NULL,
	"item_type" text,
	"item_state" integer,
	"item_max_state" integer,
	"item_quantity" integer,
	"item_last_acquisition_at" timestamp with time zone,
	"skills" jsonb,
	"offer_created_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	"payload" jsonb,
	"ingested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "job_status" NOT NULL,
	"message" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cron" text NOT NULL,
	"max_runs" integer,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_status" "job_status",
	"last_error" text,
	"state" jsonb
);
--> statement-breakpoint
CREATE TABLE "mu_member_stat_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"mu_id" text NOT NULL,
	"user_id" text NOT NULL,
	"member_row_id" text,
	"total_damages_count" integer,
	"monthly_damages_count" integer,
	"weekly_damages_count" integer,
	"total_help_count" integer,
	"monthly_help_count" integer,
	"weekly_help_count" integer,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "mu_members" (
	"mu_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mu_members_mu_id_user_id_pk" PRIMARY KEY("mu_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mu_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" "poll_status" NOT NULL,
	"error" text,
	"mu_count" integer DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mu_stat_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"mu_id" text NOT NULL,
	"weekly_damages" double precision,
	"weekly_damages_rank" integer,
	"weekly_damages_tier" text,
	"bounty" double precision,
	"bounty_rank" integer,
	"bounty_tier" text,
	"reputation" double precision,
	"reputation_rank" integer,
	"reputation_tier" text,
	"damages" double precision,
	"damages_rank" integer,
	"damages_tier" text,
	"terrain" double precision,
	"terrain_rank" integer,
	"terrain_tier" text,
	"wealth" double precision,
	"wealth_rank" integer,
	"wealth_tier" text,
	"leveling_level" integer,
	"leveling_monthly_damages" double precision,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "mu_watch_reasons" (
	"mu_id" text NOT NULL,
	"reason" text NOT NULL,
	"source_id" text NOT NULL,
	"last_touched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mu_watch_reasons_mu_id_reason_source_id_pk" PRIMARY KEY("mu_id","reason","source_id")
);
--> statement-breakpoint
CREATE TABLE "mus" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"avatar_url" text,
	"country_id" text,
	"region_id" text,
	"owner_user_id" text,
	"mercenary_reputation" double precision,
	"level" integer,
	"created_at_game" timestamp with time zone,
	"roles" jsonb,
	"active_upgrade_levels" jsonb,
	"payload" jsonb,
	"enqueued_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_watch_reasons" (
	"player_id" text NOT NULL,
	"reason" text NOT NULL,
	"source_id" text NOT NULL,
	"last_touched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_watch_reasons_player_id_reason_source_id_pk" PRIMARY KEY("player_id","reason","source_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text,
	"mu_id" text,
	"workplace_company_id" text,
	"payload" jsonb,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" "poll_status" NOT NULL,
	"error" text,
	"item_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"item_code" text NOT NULL,
	"market_price" numeric(20, 6),
	"buy_min" numeric(20, 6),
	"buy_max" numeric(20, 6),
	"buy_avg" numeric(20, 6),
	"sell_min" numeric(20, 6),
	"sell_max" numeric(20, 6),
	"sell_avg" numeric(20, 6)
);
--> statement-breakpoint
CREATE TABLE "recommended_regions" (
	"item_code" text PRIMARY KEY NOT NULL,
	"region_id" text NOT NULL,
	"region_name" text,
	"bonus" double precision,
	"payload" jsonb,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"country_code" text,
	"payload" jsonb,
	"fetched_at" timestamp with time zone,
	"enqueued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" "poll_status" NOT NULL,
	"error" text,
	"user_count" integer DEFAULT 0 NOT NULL,
	"mu_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"username" text,
	"avatar_url" text,
	"country_id" text,
	"mu_id" text,
	"company_id" text,
	"party_id" text,
	"is_active" boolean,
	"last_connection_at" timestamp with time zone,
	"last_work_at" timestamp with time zone,
	"last_help_asked_at" timestamp with time zone,
	"last_daily_reward_claimed_at" timestamp with time zone,
	"last_company_joined_at" timestamp with time zone,
	"last_daily_calendar_claimed_at" timestamp with time zone,
	"last_skills_reset_at" timestamp with time zone,
	"level" integer,
	"total_xp" integer,
	"daily_xp_left" integer,
	"available_skill_points" integer,
	"spent_skill_points" integer,
	"total_skill_points" integer,
	"prestige_level" integer,
	"military_rank" integer,
	"is_premium" boolean,
	"premium_months_count" integer,
	"created_at_game" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "worker_work_stats" (
	"company_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"daily_date" text NOT NULL,
	"employee_prod" double precision,
	"total" double precision,
	"wage" numeric(20, 6),
	"payload" jsonb,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "worker_work_stats_company_id_worker_id_daily_date_pk" PRIMARY KEY("company_id","worker_id","daily_date")
);
--> statement-breakpoint
ALTER TABLE "battle_loot_snapshots" ADD CONSTRAINT "battle_loot_snapshots_poll_id_battle_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."battle_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_scoreboard_snapshots" ADD CONSTRAINT "battle_scoreboard_snapshots_poll_id_battle_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."battle_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_snapshots" ADD CONSTRAINT "donation_snapshots_poll_id_donation_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."donation_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mu_member_stat_snapshots" ADD CONSTRAINT "mu_member_stat_snapshots_poll_id_mu_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."mu_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mu_members" ADD CONSTRAINT "mu_members_mu_id_mus_id_fk" FOREIGN KEY ("mu_id") REFERENCES "public"."mus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mu_stat_snapshots" ADD CONSTRAINT "mu_stat_snapshots_poll_id_mu_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."mu_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_poll_id_price_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."price_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_snapshots" ADD CONSTRAINT "user_profile_snapshots_poll_id_user_profile_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."user_profile_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_loot_snapshots_battle_user_poll_idx" ON "battle_loot_snapshots" USING btree ("battle_id","user_id","poll_id");--> statement-breakpoint
CREATE INDEX "battle_loot_snapshots_mu_recorded_at_idx" ON "battle_loot_snapshots" USING btree ("mu_id","recorded_at");--> statement-breakpoint
CREATE INDEX "battle_polls_status_recorded_at_idx" ON "battle_polls" USING btree ("status","recorded_at");--> statement-breakpoint
CREATE INDEX "battle_scoreboard_snapshots_battle_poll_idx" ON "battle_scoreboard_snapshots" USING btree ("battle_id","poll_id");--> statement-breakpoint
CREATE INDEX "battle_scoreboard_snapshots_battle_recorded_at_idx" ON "battle_scoreboard_snapshots" USING btree ("battle_id","recorded_at");--> statement-breakpoint
CREATE INDEX "battles_is_active_idx" ON "battles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "donation_polls_status_recorded_at_idx" ON "donation_polls" USING btree ("status","recorded_at");--> statement-breakpoint
CREATE INDEX "donation_snapshots_scope_user_poll_idx" ON "donation_snapshots" USING btree ("scope_type","scope_id","user_id","poll_id");--> statement-breakpoint
CREATE INDEX "item_market_tx_item_code_created_at_idx" ON "item_market_transactions" USING btree ("item_code","created_at");--> statement-breakpoint
CREATE INDEX "item_market_tx_created_at_idx" ON "item_market_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "item_market_tx_buyer_item_created_at_idx" ON "item_market_transactions" USING btree ("buyer_id","item_code","created_at");--> statement-breakpoint
CREATE INDEX "item_market_tx_seller_item_created_at_idx" ON "item_market_transactions" USING btree ("seller_id","item_code","created_at");--> statement-breakpoint
CREATE INDEX "job_runs_job_id_started_at_id_idx" ON "job_runs" USING btree ("job_id","started_at","id");--> statement-breakpoint
CREATE INDEX "mu_member_stat_snapshots_mu_user_poll_idx" ON "mu_member_stat_snapshots" USING btree ("mu_id","user_id","poll_id");--> statement-breakpoint
CREATE INDEX "mu_polls_status_recorded_at_idx" ON "mu_polls" USING btree ("status","recorded_at");--> statement-breakpoint
CREATE INDEX "mu_stat_snapshots_mu_poll_idx" ON "mu_stat_snapshots" USING btree ("mu_id","poll_id");--> statement-breakpoint
CREATE INDEX "price_polls_status_recorded_at_idx" ON "price_polls" USING btree ("status","recorded_at");--> statement-breakpoint
CREATE INDEX "user_profile_polls_status_recorded_at_idx" ON "user_profile_polls" USING btree ("status","recorded_at");--> statement-breakpoint
CREATE INDEX "user_profile_snapshots_user_recorded_at_idx" ON "user_profile_snapshots" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "user_profile_snapshots_poll_idx" ON "user_profile_snapshots" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "user_profile_snapshots_mu_recorded_at_idx" ON "user_profile_snapshots" USING btree ("mu_id","recorded_at");