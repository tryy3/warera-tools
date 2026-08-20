import { createClient } from "@libsql/client";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import { companyWorkStats, workerWorkStats } from "../../db/schema";
import { WATCH_REASON_FOLLOW_PLAYER, insertPlayerWatchReason } from "../../db/watch-reasons";
import { runWorkStatsPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "work-stats-poll-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT,
      mu_id TEXT,
      workplace_company_id TEXT,
      payload TEXT,
      fetched_at INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE player_watch_reasons (
      player_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, reason, source_id)
    )
  `);
  await client.execute(`
    CREATE TABLE mu_watch_reasons (
      mu_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (mu_id, reason, source_id)
    )
  `);
  await client.execute(`
    CREATE TABLE company_work_stats (
      company_id TEXT NOT NULL,
      daily_date TEXT NOT NULL,
      automated_engine REAL,
      employee_prod REAL,
      self_work REAL,
      total REAL,
      wage REAL,
      payload TEXT,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (company_id, daily_date)
    )
  `);
  await client.execute(`
    CREATE TABLE worker_work_stats (
      company_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      daily_date TEXT NOT NULL,
      employee_prod REAL,
      total REAL,
      wage REAL,
      payload TEXT,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (company_id, worker_id, daily_date)
    )
  `);
  return drizzle(client, { schema });
}

const REASON_AT = new Date("2026-08-21T00:00:00.000Z");

async function seedFollowedPlayer(db: Db, playerId: string): Promise<void> {
  await insertPlayerWatchReason(db, {
    playerId,
    reason: WATCH_REASON_FOLLOW_PLAYER,
    sourceId: "shell",
    at: REASON_AT,
  });
}

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

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

type WorkItem = { procedure: string; input?: unknown };

function parseInputFromPath(path: string): Record<string, unknown> {
  const match = path.match(/[?&]input=([^&]+)/);
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1]!)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function makeWarera(
  options: {
    companyWorkDays?: { dailyDate: string; total: number }[];
    workerWorkDays?: { dailyDate: string; total: number }[];
    ownedCompanyIdsByUser?: Record<string, string[]>;
    workplaceByUser?: Record<string, string | null>;
    workersByCompany?: Record<string, string[]>;
    failCompanyFetchFor?: string[];
    failUserLookupFor?: string[];
    failWorkStatsBatch?: boolean;
  } = {},
) {
  const ownedByUser = options.ownedCompanyIdsByUser ?? { u1: ["owned-co"] };
  const workplaceByUser = options.workplaceByUser ?? { u1: "foreign-co" };
  const workersByCompany = options.workersByCompany ?? { "owned-co": ["u1", "u2"] };
  const companyWorkDays = options.companyWorkDays ?? [{ dailyDate: "2026-08-20", total: 100 }];
  const workerWorkDays = options.workerWorkDays ?? [{ dailyDate: "2026-08-20", total: 50 }];
  const failCompanyFetchFor = new Set(options.failCompanyFetchFor ?? []);
  const failUserLookupFor = new Set(options.failUserLookupFor ?? []);
  const failWorkStatsBatch = options.failWorkStatsBatch ?? false;

  const request = vi.fn(async (path: string) => {
    const input = parseInputFromPath(path);
    if (path.includes("company.getCompanies")) {
      const userId = typeof input.userId === "string" ? input.userId : "u1";
      if (failCompanyFetchFor.has(userId)) {
        throw new Error(`company.getCompanies failed for ${userId}`);
      }
      return { result: { data: { items: ownedByUser[userId] ?? [] } } };
    }
    if (path.includes("company.getById")) {
      const id = typeof input.companyId === "string" ? input.companyId : "owned-co";
      return { result: { data: { _id: id, name: `Company ${id}` } } };
    }
    if (path.includes("worker.getWorkers")) {
      const id = typeof input.companyId === "string" ? input.companyId : "owned-co";
      const userIds = workersByCompany[id] ?? [];
      return {
        result: { data: userIds.map((userId) => ({ userId, username: userId })) },
      };
    }
    throw new Error(`unexpected request path ${path}`);
  });

  const requestBatch = vi.fn(async (items: WorkItem[]) => {
    if (items.some((i) => i.procedure === "user.getUserById")) {
      return items.map((i) => {
        const input = i.input as { userId: string };
        if (failUserLookupFor.has(input.userId)) {
          return { ok: false, error: "user lookup failed" };
        }
        return {
          ok: true,
          data: {
            _id: input.userId,
            username: input.userId,
            company: workplaceByUser[input.userId] ?? null,
          },
        };
      });
    }
    if (
      items.some(
        (i) =>
          i.procedure === "work.getStatsByCompany" ||
          i.procedure === "work.getStatsByWorkerAndCompany",
      )
    ) {
      if (failWorkStatsBatch) {
        throw new Error("work stats batch failed");
      }
      return items.map((i) => {
        if (i.procedure === "work.getStatsByCompany") {
          return { ok: true, data: companyWorkDays };
        }
        return { ok: true, data: workerWorkDays };
      });
    }
    return [];
  });

  return { request, requestBatch };
}

function workStatsBatchCall(warera: {
  requestBatch: ReturnType<typeof vi.fn>;
}): WorkItem[] | undefined {
  const call = warera.requestBatch.mock.calls.find((c) =>
    (c[0] as WorkItem[]).some((i) => i.procedure === "work.getStatsByCompany"),
  );
  return call?.[0] as WorkItem[] | undefined;
}

describe("runWorkStatsPoll", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
  });

  it("returns success zeros when follow list is empty", async () => {
    const warera = makeWarera();
    const logger = makeLogger();
    const result = await runWorkStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("success");
    expect(result.playerCount).toBe(0);
    expect(result.companyCount).toBe(0);
    expect(result.workerCount).toBe(0);
    expect(result.companyDays).toBe(0);
    expect(result.workerDays).toBe(0);
    expect(warera.request).not.toHaveBeenCalled();
    expect(await db.select().from(companyWorkStats)).toHaveLength(0);
    expect(await db.select().from(workerWorkStats)).toHaveLength(0);
  });

  it("fetches owned company stats and workplace-only worker target, not foreign roster", async () => {
    await seedFollowedPlayer(db, "u1");
    const warera = makeWarera();
    const logger = makeLogger();
    const result = await runWorkStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });

    expect(result.status).toBe("success");
    expect(result.playerCount).toBe(1);
    expect(result.companyCount).toBe(1);
    // (owned-co, u1), (owned-co, u2), (foreign-co, u1)
    expect(result.workerCount).toBe(3);

    const workItems = workStatsBatchCall(warera);
    expect(workItems).toBeTruthy();

    const companyStatItems = workItems!.filter((i) => i.procedure === "work.getStatsByCompany");
    expect(companyStatItems).toHaveLength(1);
    expect((companyStatItems[0]!.input as { companyId: string }).companyId).toBe("owned-co");

    const workerItems = workItems!.filter((i) => i.procedure === "work.getStatsByWorkerAndCompany");
    const workerTargets = workerItems.map((i) => {
      const input = i.input as { companyId: string; workerId: string };
      return { companyId: input.companyId, workerId: input.workerId };
    });
    expect(workerTargets).toContainEqual({ companyId: "owned-co", workerId: "u1" });
    expect(workerTargets).toContainEqual({ companyId: "owned-co", workerId: "u2" });
    expect(workerTargets).toContainEqual({ companyId: "foreign-co", workerId: "u1" });
    expect(workerTargets).toHaveLength(3);
    // No other workers at foreign-co
    expect(workerTargets.filter((t) => t.companyId === "foreign-co")).toEqual([
      { companyId: "foreign-co", workerId: "u1" },
    ]);

    // No search.* anywhere
    for (const call of warera.request.mock.calls) {
      expect(String(call[0])).not.toContain("search.");
    }
    for (const call of warera.requestBatch.mock.calls) {
      for (const item of call[0] as WorkItem[]) {
        expect(item.procedure).not.toContain("search.");
      }
    }

    // company stats upserted for owned-co only
    const companyRows = await listCompanyRows(db, "owned-co");
    expect(companyRows).toHaveLength(1);
    expect(companyRows[0]?.total).toBe(100);
    expect(await listCompanyRows(db, "foreign-co")).toHaveLength(0);

    // worker stats upserted for all three targets
    expect(await listWorkerRows(db, "owned-co", "u1")).toHaveLength(1);
    expect(await listWorkerRows(db, "owned-co", "u2")).toHaveLength(1);
    expect(await listWorkerRows(db, "foreign-co", "u1")).toHaveLength(1);
  });

  it("overwrites same daily_date on re-poll (last wins)", async () => {
    await seedFollowedPlayer(db, "u1");
    const logger = makeLogger();

    const warera1 = makeWarera({
      companyWorkDays: [{ dailyDate: "2026-08-20", total: 100 }],
      workerWorkDays: [{ dailyDate: "2026-08-20", total: 50 }],
    });
    await runWorkStatsPoll({ db, warera: warera1 as never, logger: logger as never });

    const warera2 = makeWarera({
      companyWorkDays: [{ dailyDate: "2026-08-20", total: 999 }],
      workerWorkDays: [{ dailyDate: "2026-08-20", total: 777 }],
    });
    const result = await runWorkStatsPoll({
      db,
      warera: warera2 as never,
      logger: logger as never,
    });

    expect(result.status).toBe("success");
    expect(result.companyDays).toBe(1);
    expect(result.workerDays).toBe(3);

    const companyRows = await listCompanyRows(db, "owned-co");
    expect(companyRows).toHaveLength(1);
    expect(companyRows[0]?.total).toBe(999);

    const workerRows = await listWorkerRows(db, "owned-co", "u1");
    expect(workerRows).toHaveLength(1);
    expect(workerRows[0]?.total).toBe(777);
  });

  it("marks partial when one player's company fetch fails but another succeeds", async () => {
    await seedFollowedPlayer(db, "u1");
    await seedFollowedPlayer(db, "u2");

    const warera = makeWarera({
      ownedCompanyIdsByUser: { u1: ["owned-co"], u2: ["owned-co-2"] },
      workplaceByUser: { u1: "foreign-co", u2: null },
      workersByCompany: { "owned-co": ["u1"], "owned-co-2": ["u2"] },
      failCompanyFetchFor: ["u2"],
    });
    const logger = makeLogger();
    const result = await runWorkStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });

    expect(result.status).toBe("partial");
    expect(result.playerCount).toBe(2);
    expect(result.companyCount).toBe(1);
    expect(result.companyDays).toBe(1);
  });

  it("marks error when all work stats targets fail", async () => {
    await seedFollowedPlayer(db, "u1");
    const warera = makeWarera({ failWorkStatsBatch: true });
    const logger = makeLogger();
    const result = await runWorkStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });

    expect(result.status).toBe("error");
    expect(result.playerCount).toBe(1);
    expect(result.companyCount).toBe(1);
    expect(result.workerCount).toBe(3);
    expect(result.companyDays).toBe(0);
    expect(result.workerDays).toBe(0);
    expect(await db.select().from(companyWorkStats)).toHaveLength(0);
    expect(await db.select().from(workerWorkStats)).toHaveLength(0);
  });
});
