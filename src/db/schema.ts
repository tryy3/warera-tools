import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
