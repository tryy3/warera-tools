CREATE TABLE "user_fight_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"status" "poll_status" NOT NULL,
	"error" text,
	"user_count" integer DEFAULT 0 NOT NULL,
	"mu_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_fight_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"mu_id" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"username" text NOT NULL,
	"level" integer NOT NULL,
	"military_rank_bonus" double precision NOT NULL,
	"ammo_label" text,
	"pill_label" text,
	"pill_ends_at" timestamp with time zone,
	"skill_levels" jsonb NOT NULL,
	"last_skills_reset_at" timestamp with time zone,
	"avatar_url" text,
	"atk" double precision NOT NULL,
	"precision" double precision NOT NULL,
	"crit_chance" double precision NOT NULL,
	"crit_damage" double precision NOT NULL,
	"armor" double precision NOT NULL,
	"dodge" double precision NOT NULL,
	"hp" double precision NOT NULL,
	"max_hp" double precision NOT NULL,
	"hunger" double precision NOT NULL,
	"max_hunger" double precision NOT NULL,
	"hp_regen_per_hour" double precision NOT NULL,
	"hunger_regen_per_hour" double precision NOT NULL,
	"pill_status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_fight_snapshots" ADD CONSTRAINT "user_fight_snapshots_poll_id_user_fight_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."user_fight_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_fight_polls_status_recorded_at_idx" ON "user_fight_polls" USING btree ("status","recorded_at");--> statement-breakpoint
CREATE INDEX "user_fight_snapshots_user_recorded_at_idx" ON "user_fight_snapshots" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "user_fight_snapshots_poll_idx" ON "user_fight_snapshots" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "user_fight_snapshots_mu_recorded_at_idx" ON "user_fight_snapshots" USING btree ("mu_id","recorded_at");