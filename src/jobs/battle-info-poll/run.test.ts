import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { MANUAL_SOURCE_ID, WATCH_REASON_MANUAL, insertMuWatchReason } from "../../db/watch-reasons";
import * as schema from "../../db/schema";
import { runBattleInfoPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "battle-info-poll-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mus (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      avatar_url TEXT,
      country_id TEXT,
      region_id TEXT,
      owner_user_id TEXT,
      mercenary_reputation REAL,
      level INTEGER,
      created_at_game INTEGER,
      roles TEXT,
      active_upgrade_levels TEXT,
      payload TEXT,
      enqueued_at INTEGER NOT NULL,
      fetched_at INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE mu_members (
      mu_id TEXT NOT NULL REFERENCES mus(id),
      user_id TEXT NOT NULL,
      role TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (mu_id, user_id)
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
    CREATE TABLE battles (
      id TEXT PRIMARY KEY NOT NULL,
      war_id TEXT,
      type TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      attacker_country_id TEXT,
      defender_country_id TEXT,
      attacker_region_id TEXT,
      defender_region_id TEXT,
      rounds_to_win INTEGER,
      current_round_id TEXT,
      current_round_number INTEGER,
      attacker_won_rounds INTEGER,
      defender_won_rounds INTEGER,
      attacker_mu_orders TEXT,
      defender_mu_orders TEXT,
      sticky_mu_ids TEXT,
      rounds_history TEXT,
      started_at_game INTEGER,
      ended_at INTEGER,
      finalized_at INTEGER,
      fetched_at INTEGER,
      payload TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE battle_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      active_battle_pages INTEGER,
      battle_count INTEGER NOT NULL DEFAULT 0,
      loot_snapshot_count INTEGER NOT NULL DEFAULT 0,
      finalized_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE battle_scoreboard_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES battle_polls(id),
      battle_id TEXT NOT NULL,
      round_id TEXT,
      round_number INTEGER,
      round_is_active INTEGER,
      attacker_points REAL,
      defender_points REAL,
      attacker_damages REAL,
      defender_damages REAL,
      attacker_hit_count INTEGER,
      defender_hit_count INTEGER,
      ticks_count INTEGER,
      next_tick_at INTEGER,
      round_started_at_game INTEGER,
      recorded_at INTEGER NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE battle_loot_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES battle_polls(id),
      battle_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mu_id TEXT NOT NULL,
      total_dmg REAL,
      hits INTEGER,
      total_money_from_bounty REAL,
      total_money_from_contract REAL,
      case1_count INTEGER,
      case2_count INTEGER,
      pool_loot TEXT,
      payload TEXT,
      recorded_at INTEGER NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

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
  beforeEach(async () => {
    db = await createDb();
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
      activeBattles: [battleFixture({ id: "b1", attackerMuOrders: [] })],
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
    const scoreboard = await db.select().from(schema.battleScoreboardSnapshots);
    expect(scoreboard).toHaveLength(2);
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
});
