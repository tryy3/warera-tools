import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { pruneJobRuns } from "./prune";

async function createDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      enabled INTEGER DEFAULT 1 NOT NULL,
      cron TEXT NOT NULL,
      max_runs INTEGER,
      last_started_at INTEGER,
      last_finished_at INTEGER,
      last_status TEXT,
      last_error TEXT,
      state TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER
    )
  `);
  return drizzle(client, { schema });
}

describe("pruneJobRuns", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
    await db.insert(schema.jobs).values({
      id: "j1",
      name: "J1",
      cron: "0 * * * * *",
    });
  });

  it("no-ops when row count is under keep", async () => {
    const t0 = new Date("2026-09-01T00:00:00.000Z");
    await db.insert(schema.jobRuns).values([
      { jobId: "j1", startedAt: t0, status: "success" },
      { jobId: "j1", startedAt: new Date(t0.getTime() + 1000), status: "success" },
    ]);
    await pruneJobRuns(db, "j1", 50);
    expect(await db.select().from(schema.jobRuns).where(eq(schema.jobRuns.jobId, "j1"))).toHaveLength(
      2,
    );
  });

  it("keeps the newest keep rows and deletes older ones", async () => {
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.jobRuns).values({
        jobId: "j1",
        startedAt: new Date(base + i * 1000),
        status: "success",
      });
    }
    await pruneJobRuns(db, "j1", 2);
    const remaining = await db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.jobId, "j1"));
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.startedAt.getTime()).sort()).toEqual([
      base + 3000,
      base + 4000,
    ]);
  });

  it("deletes all rows when keep is 0", async () => {
    await db.insert(schema.jobRuns).values({
      jobId: "j1",
      startedAt: new Date(),
      status: "success",
    });
    await pruneJobRuns(db, "j1", 0);
    expect(await db.select().from(schema.jobRuns)).toHaveLength(0);
  });
});
