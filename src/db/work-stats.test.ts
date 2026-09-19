import { and, asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { CompanyWorkDay, WorkerWorkDay } from "../warera/work-stats";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import { companyWorkStats, workerWorkStats } from "./schema";
import { upsertCompanyWorkDays, upsertWorkerWorkDays } from "./work-stats";

async function listCompanyRows(db: Db, companyId: string) {
  return db
    .select()
    .from(companyWorkStats)
    .where(eq(companyWorkStats.companyId, companyId))
    .orderBy(asc(companyWorkStats.dailyDate));
}

async function listWorkerRows(db: Db, companyId: string, workerId: string) {
  return db
    .select()
    .from(workerWorkStats)
    .where(and(eq(workerWorkStats.companyId, companyId), eq(workerWorkStats.workerId, workerId)))
    .orderBy(asc(workerWorkStats.dailyDate));
}

describe("work-stats db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("upserts two company days and overwrites same date on re-poll", async () => {
    const t1 = new Date("2026-08-21T00:00:00.000Z");
    const t2 = new Date("2026-08-21T01:00:00.000Z");
    const days: CompanyWorkDay[] = [
      {
        dailyDate: "2026-08-19",
        automatedEngine: 1,
        employeeProd: 2,
        selfWork: 3,
        total: 6,
        wage: 10,
        payload: { dailyDate: "2026-08-19" },
      },
      {
        dailyDate: "2026-08-20",
        automatedEngine: 4,
        employeeProd: 5,
        selfWork: 6,
        total: 15,
        wage: 20,
        payload: { dailyDate: "2026-08-20" },
      },
    ];

    expect(await upsertCompanyWorkDays(db, "c1", days, t1)).toBe(2);
    expect(await listCompanyRows(db, "c1")).toHaveLength(2);

    const refreshed: CompanyWorkDay[] = [
      {
        dailyDate: "2026-08-20",
        automatedEngine: 40,
        employeeProd: 50,
        selfWork: 60,
        total: 999,
        wage: 200,
        payload: { dailyDate: "2026-08-20", refreshed: true },
      },
    ];
    expect(await upsertCompanyWorkDays(db, "c1", refreshed, t2)).toBe(1);

    const rows = await listCompanyRows(db, "c1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      companyId: "c1",
      dailyDate: "2026-08-19",
      total: 6,
      fetchedAt: t1,
    });
    expect(rows[1]).toMatchObject({
      companyId: "c1",
      dailyDate: "2026-08-20",
      total: 999,
      automatedEngine: 40,
      fetchedAt: t2,
      payload: { dailyDate: "2026-08-20", refreshed: true },
    });
  });

  it("stores worker stats under company+worker+date and keeps same worker in two companies", async () => {
    const t1 = new Date("2026-08-21T00:00:00.000Z");
    const day: WorkerWorkDay = {
      dailyDate: "2026-08-20",
      employeeProd: 7,
      total: 8,
      wage: 9,
      payload: { dailyDate: "2026-08-20" },
    };

    expect(await upsertWorkerWorkDays(db, { companyId: "c1", workerId: "w1" }, [day], t1)).toBe(1);
    expect(await upsertWorkerWorkDays(db, { companyId: "c2", workerId: "w1" }, [day], t1)).toBe(1);

    const c1Rows = await listWorkerRows(db, "c1", "w1");
    const c2Rows = await listWorkerRows(db, "c2", "w1");
    expect(c1Rows).toHaveLength(1);
    expect(c2Rows).toHaveLength(1);
    expect(c1Rows[0]).toMatchObject({
      companyId: "c1",
      workerId: "w1",
      dailyDate: "2026-08-20",
      total: 8,
    });
    expect(c2Rows[0]).toMatchObject({
      companyId: "c2",
      workerId: "w1",
      dailyDate: "2026-08-20",
      total: 8,
    });

    const t2 = new Date("2026-08-21T01:00:00.000Z");
    await upsertWorkerWorkDays(
      db,
      { companyId: "c1", workerId: "w1" },
      [{ ...day, total: 123 }],
      t2,
    );

    const updated = await listWorkerRows(db, "c1", "w1");
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ total: 123, fetchedAt: t2 });
    expect((await listWorkerRows(db, "c2", "w1"))[0]?.total).toBe(8);
  });

  it("returns 0 when no days are provided", async () => {
    const t = new Date("2026-08-21T00:00:00.000Z");
    expect(await upsertCompanyWorkDays(db, "c1", [], t)).toBe(0);
    expect(await upsertWorkerWorkDays(db, { companyId: "c1", workerId: "w1" }, [], t)).toBe(0);
  });
});
