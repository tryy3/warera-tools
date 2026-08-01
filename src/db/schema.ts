import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobStatuses = ["success", "error", "running"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  cron: text("cron").notNull(),
  lastStartedAt: integer("last_started_at", { mode: "timestamp_ms" }),
  lastFinishedAt: integer("last_finished_at", { mode: "timestamp_ms" }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  state: text("state", { mode: "json" }).$type<Record<string, unknown> | null>(),
});

export const jobRuns = sqliteTable("job_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  status: text("status").notNull(),
  message: text("message"),
  durationMs: integer("duration_ms"),
});

export const cache = sqliteTable("cache", {
  key: text("key").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull(),
  tags: text("tags"),
});

export const countrySources = ["warera", "manual"] as const;
export type CountrySource = (typeof countrySources)[number];

export const countries = sqliteTable("countries", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  taxRate: real("tax_rate").notNull(),
  isoCode: text("iso_code"),
  source: text("source").notNull().default("manual"),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pricePollStatuses = ["success", "partial", "error"] as const;
export type PricePollStatus = (typeof pricePollStatuses)[number];

export const pricePolls = sqliteTable("price_polls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull(),
  error: text("error"),
  itemCount: integer("item_count").notNull().default(0),
});

export const priceSnapshots = sqliteTable("price_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pollId: integer("poll_id")
    .notNull()
    .references(() => pricePolls.id),
  itemCode: text("item_code").notNull(),
  marketPrice: real("market_price"),
  buyMin: real("buy_min"),
  buyMax: real("buy_max"),
  buyAvg: real("buy_avg"),
  sellMin: real("sell_min"),
  sellMax: real("sell_max"),
  sellAvg: real("sell_avg"),
});

export const recommendedRegions = sqliteTable("recommended_regions", {
  itemCode: text("item_code").primaryKey(),
  regionId: text("region_id").notNull(),
  regionName: text("region_name"),
  bonus: real("bonus"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const regions = sqliteTable("regions", {
  id: text("id").primaryKey(),
  name: text("name"),
  countryCode: text("country_code"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
  enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" }).notNull(),
});

export const companyPacks = sqliteTable("company_packs", {
  userId: text("user_id").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull().$type<unknown>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull().default(600),
});
