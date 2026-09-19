import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "../db/client";
import { createTestDb, truncateAllTables } from "../db/test/postgres";
import * as schema from "../db/schema";
import { pruneJobRuns } from "./prune";

describe("pruneJobRuns", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
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
    expect(
      await db.select().from(schema.jobRuns).where(eq(schema.jobRuns.jobId, "j1")),
    ).toHaveLength(2);
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
    const remaining = await db.select().from(schema.jobRuns).where(eq(schema.jobRuns.jobId, "j1"));
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.startedAt.getTime()).toSorted((a, b) => a - b)).toEqual([
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

  it("uses id DESC tiebreaker when started_at is equal", async () => {
    const sameTime = new Date("2026-09-01T00:00:00.000Z");
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [row] = await db
        .insert(schema.jobRuns)
        .values({ jobId: "j1", startedAt: sameTime, status: "success" })
        .returning({ id: schema.jobRuns.id });
      ids.push(row!.id);
    }

    await pruneJobRuns(db, "j1", 2);

    const remainingIds = (
      await db
        .select({ id: schema.jobRuns.id })
        .from(schema.jobRuns)
        .where(eq(schema.jobRuns.jobId, "j1"))
        .orderBy(desc(schema.jobRuns.id))
    ).map((r) => r.id);

    expect(remainingIds).toEqual([ids[3], ids[2]]);
  });
});
