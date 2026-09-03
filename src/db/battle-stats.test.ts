import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import {
  insertBattleLootSnapshots,
  insertBattlePoll,
  insertBattleScoreboardSnapshots,
} from "./battle-stats";
import * as schema from "./schema";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "battle-stats-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
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

describe("battle-stats db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("inserts poll, scoreboard, and loot snapshots and returns ids / row counts", async () => {
    const recordedAt = new Date("2026-09-03T12:00:00.000Z");
    const pollId = await insertBattlePoll(db, {
      recordedAt,
      status: "success",
      error: null,
      activeBattlePages: 2,
      battleCount: 1,
      lootSnapshotCount: 1,
      finalizedCount: 0,
    });
    expect(pollId).toBeGreaterThan(0);

    await insertBattleScoreboardSnapshots(db, pollId, [
      {
        battleId: "b1",
        roundId: "round-1",
        roundNumber: 3,
        roundIsActive: true,
        attackerPoints: 50,
        defenderPoints: 40,
        attackerDamages: 1000,
        defenderDamages: 800,
        attackerHitCount: 10,
        defenderHitCount: 8,
        ticksCount: 12,
        nextTickAt: new Date("2026-09-03T12:05:00.000Z"),
        roundStartedAtGame: new Date("2026-09-03T11:00:00.000Z"),
        recordedAt,
      },
    ]);
    await insertBattleLootSnapshots(db, pollId, [
      {
        battleId: "b1",
        userId: "u1",
        muId: "mu-a",
        totalDmg: 250,
        hits: 4,
        totalMoneyFromBounty: 10,
        totalMoneyFromContract: 5,
        case1Count: 1,
        case2Count: 0,
        poolLoot: [{ item: "case" }],
        payload: { leftover: true },
        recordedAt,
      },
    ]);

    const scoreboard = await db
      .select()
      .from(schema.battleScoreboardSnapshots)
      .where(eq(schema.battleScoreboardSnapshots.pollId, pollId));
    expect(scoreboard).toHaveLength(1);
    expect(scoreboard[0]?.attackerDamages).toBe(1000);
    expect(scoreboard[0]?.roundIsActive).toBe(true);

    const loot = await db
      .select()
      .from(schema.battleLootSnapshots)
      .where(eq(schema.battleLootSnapshots.pollId, pollId));
    expect(loot).toHaveLength(1);
    expect(loot[0]?.totalDmg).toBe(250);
    expect(loot[0]?.userId).toBe("u1");
  });

  it("no-ops on empty snapshot arrays", async () => {
    const pollId = await insertBattlePoll(db, {
      recordedAt: new Date("2026-09-03T12:00:00.000Z"),
      status: "error",
      error: "none",
      activeBattlePages: 0,
      battleCount: 0,
      lootSnapshotCount: 0,
      finalizedCount: 0,
    });
    await insertBattleScoreboardSnapshots(db, pollId, []);
    await insertBattleLootSnapshots(db, pollId, []);
    expect(pollId).toBeGreaterThan(0);
  });
});
