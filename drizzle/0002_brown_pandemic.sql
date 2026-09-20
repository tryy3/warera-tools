CREATE TYPE "public"."battle_order_owner_type" AS ENUM('mu', 'country');--> statement-breakpoint
CREATE TYPE "public"."battle_order_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."battle_order_side" AS ENUM('attacker', 'defender');--> statement-breakpoint
CREATE TABLE "battle_bonus_facts" (
	"battle_id" text PRIMARY KEY NOT NULL,
	"is_revolt" boolean NOT NULL,
	"bunker_level" integer,
	"bunker_active" boolean,
	"military_base_level" integer,
	"military_base_active" boolean,
	"resistance" double precision,
	"defender_supply_linked" boolean,
	"attacker_region_id" text,
	"defender_region_id" text,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_orders" (
	"battle_id" text NOT NULL,
	"owner_type" "battle_order_owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"side" "battle_order_side" NOT NULL,
	"priority" "battle_order_priority" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "battle_orders_battle_id_owner_type_owner_id_pk" PRIMARY KEY("battle_id","owner_type","owner_id")
);
--> statement-breakpoint
CREATE TABLE "country_diplomacy" (
	"country_id" text PRIMARY KEY NOT NULL,
	"alliance_id" text,
	"alliance_world_share" double precision,
	"sworn_enemy_id" text,
	"sworn_enemy_since" timestamp with time zone,
	"defensive_pacts" jsonb,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "attacker_country_orders" jsonb;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "defender_country_orders" jsonb;--> statement-breakpoint
ALTER TABLE "battle_bonus_facts" ADD CONSTRAINT "battle_bonus_facts_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_orders" ADD CONSTRAINT "battle_orders_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_orders_owner_idx" ON "battle_orders" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "country_diplomacy_alliance_idx" ON "country_diplomacy" USING btree ("alliance_id");