import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import {
  MANUAL_SOURCE_ID,
  WATCH_REASON_MANUAL,
  deleteMuWatchReason,
  insertMuWatchReason,
} from "../../db/watch-reasons";
import * as schema from "../../db/schema";
import { runBattleInfoPoll } from "./run";

const REASON_AT = new Date("2026-09-01T00:00:00.000Z");

async function seedMuWatch(db: Db, muId: string): Promise<void> {
  await insertMuWatchReason(db, {
    muId,
    reason: WATCH_REASON_MANUAL,
    sourceId: MANUAL_SOURCE_ID,
    at: REASON_AT,
  });
}

async function seedMuMembers(db: Db, muId: string, userIds: string[]): Promise<void> {
  await db.insert(schema.mus).values({ id: muId, enqueuedAt: REASON_AT }).onConflictDoNothing();
  for (const userId of userIds) {
    await db
      .insert(schema.muMembers)
      .values({ muId, userId, role: null, updatedAt: REASON_AT })
      .onConflictDoNothing();
  }
}

function battleFixture(opts: {
  id: string;
  attackerMuOrders?: string[];
  defenderMuOrders?: string[];
  isActive?: boolean;
  roundId?: string;
  roundNumber?: number;
}): unknown {
  return {
    _id: opts.id,
    war: "w1",
    type: "war",
    isActive: opts.isActive ?? true,
    attacker: {
      country: "c-att",
      region: "r-att",
      wonRoundsCount: 1,
      muOrders: opts.attackerMuOrders ?? [],
      hitCount: 10,
    },
    defender: {
      country: "c-def",
      region: "r-def",
      wonRoundsCount: 0,
      muOrders: opts.defenderMuOrders ?? [],
      hitCount: 8,
    },
    roundsToWin: 8,
    rounds: ["round-1"],
    roundsHistory: [{ round: 1 }],
    createdAt: "2026-09-01T00:00:00.000Z",
    currentRound: {
      _id: opts.roundId ?? "round-1",
      number: opts.roundNumber ?? 3,
      isActive: true,
      attacker: { damages: 1000, points: 50 },
      defender: { damages: 800, points: 40 },
      live: { ticksCount: 12, nextTickAt: "2026-09-01T00:05:00.000Z" },
      createdAt: "2026-09-01T00:01:00.000Z",
    },
  };
}

function lootFixture(opts: { totalDmg?: number; hits?: number }): unknown {
  return {
    totalDmg: opts.totalDmg ?? 250,
    hits: opts.hits ?? 4,
    totalMoneyFromBounty: 10,
    totalMoneyFromContract: 5,
    case1Count: 1,
    case2Count: 0,
    poolLoot: [{ item: "case" }],
  };
}

function makeWarera(handlers: {
  activeBattles?: unknown[];
  incomplete?: boolean;
  getById?: (battleId: string) => unknown;
  loot?: (battleId: string, userId: string) => unknown;
  lootNotFoundFor?: Set<string>;
  lootThrowFor?: Set<string>;
}) {
  const request = vi.fn(async (path: string) => {
    if (path.includes("battle.getBattles")) {
      if (handlers.incomplete) {
        throw new Error("WarEra request failed: 500 boom");
      }
      return { result: { data: { items: handlers.activeBattles ?? [], nextCursor: null } } };
    }
    if (path.includes("battle.getById")) {
      const match = path.match(/battleId%22%3A%22([^%]+)/);
      const battleId = match?.[1] ?? "";
      const body = handlers.getById?.(battleId);
      if (body === null) {
        throw new Error("WarEra request failed: 404 NOT_FOUND");
      }
      return { result: { data: body ?? battleFixture({ id: battleId }) } };
    }
    if (path.includes("battleLootSummary.getByBattleAndUser")) {
      const match = path.match(/battleId%22%3A%22([^%]+)%22%2C%22userId%22%3A%22([^%]+)/);
      const battleId = match?.[1] ?? "";
      const userId = match?.[2] ?? "";
      if (handlers.lootThrowFor?.has(`${battleId}/${userId}`)) {
        throw new Error("loot transport error");
      }
      if (handlers.lootNotFoundFor?.has(`${battleId}/${userId}`)) {
        throw new Error("WarEra request failed: 404 NOT_FOUND");
      }
      const body = handlers.loot?.(battleId, userId);
      return { result: { data: body ?? lootFixture({}) } };
    }
    throw new Error(`unexpected path ${path}`);
  });
  return { request, requestBatch: vi.fn(async () => []) };
}

function makeLogger() {
  return {
    silly: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
}

describe("runBattleInfoPoll", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("happy path: upserts watched battle, writes scoreboard + loot, status success", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1", "u2"]);
    const warera = makeWarera({
      activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      loot: () => lootFixture({ totalDmg: 100 }),
    });
    const result = await runBattleInfoPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    expect(result.status).toBe("success");
    expect(result.battleCount).toBe(1);
    expect(result.lootSnapshotCount).toBe(2);
    expect(result.finalizedCount).toBe(0);
    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.isActive).toBe(true);
    expect(row?.stickyMuIds).toEqual(["mu-a"]);
    expect(row?.endedAt).toBeNull();
    const scoreboard = await db.select().from(schema.battleScoreboardSnapshots);
    expect(scoreboard).toHaveLength(1);
    expect(scoreboard[0]?.roundNumber).toBe(3);
    const loot = await db.select().from(schema.battleLootSnapshots);
    expect(loot).toHaveLength(2);
    expect(loot.map((l) => l.userId).sort()).toEqual(["u1", "u2"]);
    const polls = await db.select().from(schema.battlePolls);
    expect(polls[0]?.status).toBe("success");
    expect(polls[0]?.battleCount).toBe(1);
    expect(polls[0]?.lootSnapshotCount).toBe(2);
  });

  it("irrelevant battle: no watched MU orders and not sticky -> no DB row, no loot", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1"]);
    const warera = makeWarera({
      activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-other"] })],
    });
    const result = await runBattleInfoPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    expect(result.status).toBe("success");
    expect(result.battleCount).toBe(0);
    expect(result.lootSnapshotCount).toBe(0);
    const rows = await db.select().from(schema.battles);
    expect(rows).toHaveLength(0);
    const loot = await db.select().from(schema.battleLootSnapshots);
    expect(loot).toHaveLength(0);
  });

  it("sticky after order removed: still scoreboard + loot, sticky ids preserved", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1"]);
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T11:45:00.000Z"),
    });
    const warera = makeWarera({
      activeBattles: [
        battleFixture({ id: "b1", attackerMuOrders: [], roundNumber: 7, roundId: "round-7" }),
      ],
      loot: () => lootFixture({}),
    });
    const result = await runBattleInfoPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    expect(result.status).toBe("success");
    expect(result.battleCount).toBe(1);
    expect(result.lootSnapshotCount).toBe(1);
    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.stickyMuIds).toEqual(["mu-a"]);
    expect(row?.isActive).toBe(true);
    expect(row?.attackerMuOrders).toEqual([]);
    expect(row?.currentRoundNumber).toBe(7);
    const scoreboard = await db.select().from(schema.battleScoreboardSnapshots);
    expect(scoreboard).toHaveLength(2);
    expect(scoreboard[1]?.roundNumber).toBe(7);
  });

  it("incomplete pagination: does not mark missing DB battle as ended, status partial", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1"]);
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    const warera = makeWarera({ incomplete: true });
    const result = await runBattleInfoPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:15:00.000Z"),
    });
    expect(result.status).toBe("partial");
    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.isActive).toBe(true);
    expect(row?.endedAt).toBeNull();
  });

  it("end + grace: absent from complete active set -> set ended_at; <60s -> loot, no getById, not finalized", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1"]);
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    const warera = makeWarera({
      activeBattles: [],
      loot: () => lootFixture({}),
    });
    const result = await runBattleInfoPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:15:00.000Z"),
    });
    expect(result.status).toBe("success");
    expect(result.battleCount).toBe(1);
    expect(result.lootSnapshotCount).toBe(1);
    expect(result.finalizedCount).toBe(0);
    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.endedAt).toEqual(new Date("2026-09-03T12:15:00.000Z"));
    expect(row?.isActive).toBe(true);
    expect(row?.finalizedAt).toBeNull();
    const getByIdCalls = warera.request.mock.calls.filter((c) =>
      String(c[0]).includes("battle.getById"),
    );
    expect(getByIdCalls).toHaveLength(0);
  });

  it("finalize: ended_at older than 60s -> one getById, final loot, is_active=false, finalized_at set", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1"]);
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    // Mark ended 5 min ago (past grace).
    await runBattleInfoPoll({
      db,
      warera: makeWarera({ activeBattles: [] }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:10:00.000Z"),
    });
    const [endedRow] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(endedRow?.endedAt).toEqual(new Date("2026-09-03T12:10:00.000Z"));
    const warera = makeWarera({
      activeBattles: [],
      loot: () => lootFixture({}),
    });
    const result = await runBattleInfoPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:15:00.000Z"),
    });
    expect(result.status).toBe("success");
    expect(result.finalizedCount).toBe(1);
    expect(result.lootSnapshotCount).toBe(1);
    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.isActive).toBe(false);
    expect(row?.finalizedAt).toEqual(new Date("2026-09-03T12:15:00.000Z"));
    const getByIdCalls = warera.request.mock.calls.filter((c) =>
      String(c[0]).includes("battle.getById"),
    );
    expect(getByIdCalls).toHaveLength(1);
    const getByIdIdx = warera.request.mock.calls.findIndex((c) =>
      String(c[0]).includes("battle.getById"),
    );
    const lootIdx = warera.request.mock.calls.findIndex((c) =>
      String(c[0]).includes("battleLootSummary.getByBattleAndUser"),
    );
    expect(lootIdx).toBeGreaterThan(getByIdIdx);
  });

  it("reappearance after ended_at: clears ended_at; later absence starts a fresh settle window", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1"]);
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    await runBattleInfoPoll({
      db,
      warera: makeWarera({ activeBattles: [] }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:10:00.000Z"),
    });
    const [endedRow] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(endedRow?.endedAt).toEqual(new Date("2026-09-03T12:10:00.000Z"));

    // Reappears after grace would have elapsed — must clear ended_at, not finalize.
    const reappear = await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"], roundNumber: 4 })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:15:00.000Z"),
    });
    expect(reappear.finalizedCount).toBe(0);
    const [liveRow] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(liveRow?.endedAt).toBeNull();
    expect(liveRow?.isActive).toBe(true);
    expect(liveRow?.finalizedAt).toBeNull();
    expect(liveRow?.currentRoundNumber).toBe(4);

    const absentAgain = await runBattleInfoPoll({
      db,
      warera: makeWarera({ activeBattles: [] }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:16:00.000Z"),
    });
    expect(absentAgain.finalizedCount).toBe(0);
    const [freshEnded] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(freshEnded?.endedAt).toEqual(new Date("2026-09-03T12:16:00.000Z"));
    expect(freshEnded?.isActive).toBe(true);
    expect(freshEnded?.finalizedAt).toBeNull();
  });

  it("finalize: crash during final loot leaves is_active true and unfinalized", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1"]);
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    await runBattleInfoPoll({
      db,
      warera: makeWarera({ activeBattles: [] }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:10:00.000Z"),
    });

    const logger = makeLogger();
    logger.warn.mockImplementation((_ctx, msg) => {
      if (msg === "battle loot fetch failed") throw new Error("loot log boom");
    });
    const result = await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [],
        lootThrowFor: new Set(["b1/u1"]),
      }) as never,
      logger: logger as never,
      now: new Date("2026-09-03T12:15:00.000Z"),
    });
    expect(result.finalizedCount).toBe(0);
    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.isActive).toBe(true);
    expect(row?.finalizedAt).toBeNull();
  });

  it("loot not-found: member with NOT_FOUND -> no loot row, poll still success", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1", "u2"]);
    const warera = makeWarera({
      activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      loot: () => lootFixture({}),
      lootNotFoundFor: new Set(["b1/u2"]),
    });
    const result = await runBattleInfoPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    expect(result.status).toBe("success");
    expect(result.lootSnapshotCount).toBe(1);
    const loot = await db.select().from(schema.battleLootSnapshots);
    expect(loot.map((l) => l.userId).sort()).toEqual(["u1"]);
  });

  it("fix1: finalize-path loot error (non-not-found) leaves battle active, unfinalized, but keeps succeeded loot snapshots", async () => {
    await seedMuWatch(db, "mu-a");
    await seedMuMembers(db, "mu-a", ["u1", "u2"]);
    // Establish the battle.
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-a"] })],
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    // Mark ended 5 min ago (past grace).
    await runBattleInfoPoll({
      db,
      warera: makeWarera({ activeBattles: [] }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:10:00.000Z"),
    });

    // Finalize run: u1 loot throws a non-not-found error, u2 loot succeeds.
    const result = await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [],
        lootThrowFor: new Set(["b1/u1"]),
        loot: () => lootFixture({}),
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:15:00.000Z"),
    });
    expect(result.finalizedCount).toBe(0);
    expect(result.status).toBe("partial");
    const [row] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row?.isActive).toBe(true);
    expect(row?.finalizedAt).toBeNull();
    // The succeeded member's loot snapshot for THIS poll is still durable.
    const pollRows = await db
      .select()
      .from(schema.battleLootSnapshots)
      .where(eq(schema.battleLootSnapshots.pollId, result.pollId));
    expect(pollRows.map((l) => l.userId).sort()).toEqual(["u2"]);
  });

  it("fix2: sticky unwatched MU still gets loot for its mu_members (roster loaded from stickyMuIds)", async () => {
    // mu-sticky is watched initially so the battle becomes sticky for it.
    await seedMuWatch(db, "mu-sticky");
    await seedMuMembers(db, "mu-sticky", ["u-s"]);
    await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: ["mu-sticky"] })],
        loot: () => lootFixture({}),
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:00:00.000Z"),
    });
    const [row1] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row1?.stickyMuIds).toEqual(["mu-sticky"]);

    // Unwatch mu-sticky AND change the battle's current orders away from it.
    await deleteMuWatchReason(db, {
      muId: "mu-sticky",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
    });
    const result = await runBattleInfoPoll({
      db,
      warera: makeWarera({
        activeBattles: [battleFixture({ id: "b1", attackerMuOrders: [] })],
        loot: () => lootFixture({}),
      }) as never,
      logger: makeLogger() as never,
      now: new Date("2026-09-03T12:15:00.000Z"),
    });
    expect(result.status).toBe("success");
    // sticky mu-sticky preserved even though no longer watched or in orders.
    const [row2] = await db.select().from(schema.battles).where(eq(schema.battles.id, "b1"));
    expect(row2?.stickyMuIds).toEqual(["mu-sticky"]);
    // u-s still gets a loot snapshot because rosterByMu loaded mu-sticky.
    const pollRows = await db
      .select()
      .from(schema.battleLootSnapshots)
      .where(eq(schema.battleLootSnapshots.pollId, result.pollId));
    expect(pollRows.map((l) => l.userId).sort()).toEqual(["u-s"]);
  });
});
