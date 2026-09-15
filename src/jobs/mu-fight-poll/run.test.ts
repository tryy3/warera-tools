import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import { fightStateFingerprintCache, runMuFightPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mu-fight-poll-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
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
    CREATE TABLE mu_members (
      mu_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (mu_id, user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE user_fight_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      user_count INTEGER NOT NULL DEFAULT 0,
      mu_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE user_fight_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES user_fight_polls(id),
      user_id TEXT NOT NULL,
      mu_id TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      username TEXT NOT NULL,
      level INTEGER NOT NULL,
      military_rank_bonus REAL NOT NULL,
      ammo_label TEXT,
      pill_label TEXT,
      pill_ends_at INTEGER,
      skill_levels TEXT NOT NULL,
      last_skills_reset_at INTEGER,
      avatar_url TEXT,
      atk REAL NOT NULL,
      precision REAL NOT NULL,
      crit_chance REAL NOT NULL,
      crit_damage REAL NOT NULL,
      armor REAL NOT NULL,
      dodge REAL NOT NULL,
      hp REAL NOT NULL,
      max_hp REAL NOT NULL,
      hunger REAL NOT NULL,
      max_hunger REAL NOT NULL,
      hp_regen_per_hour REAL NOT NULL,
      hunger_regen_per_hour REAL NOT NULL,
      pill_status TEXT NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

const NOW = new Date("2026-09-15T12:00:00.000Z");

function fightFixture(userId: string, mu: string | undefined = "mu-1") {
  return {
    _id: userId,
    username: `fighter-${userId}`,
    ...(mu ? { mu } : {}),
    avatarUrl: `https://example.test/${userId}.png`,
    leveling: { level: 42 },
    equipment: { ammo: "Q5" },
    buffs: { buffCodes: ["cocain"], buffEndAt: "2026-09-15T13:00:00.000Z" },
    dates: { lastSkillsResetAt: "2026-09-01T00:00:00.000Z" },
    skills: {
      attack: {
        total: 1_234,
        level: 11,
        militaryRankPercent: 35,
        buffsPercent: 15,
        debuffsPercent: 0,
      },
      precision: { total: 82, level: 8 },
      criticalChance: { total: 24, level: 6 },
      criticalDamages: { total: 266, level: 7 },
      armor: { total: 480, level: 5 },
      dodge: { total: 130, level: 4 },
      health: { total: 1_000, currentBarValue: 900, hourlyBarRegen: 60, level: 9 },
      hunger: { total: 100, currentBarValue: 88, hourlyBarRegen: 12, level: 3 },
    },
  };
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

async function seedWatchedMu(db: Db, muId: string, userIds: string[]): Promise<void> {
  await db.insert(schema.muWatchReasons).values({
    muId,
    reason: "manual",
    sourceId: "test",
    lastTouchedAt: NOW,
    createdAt: NOW,
  });
  if (userIds.length > 0) {
    await db
      .insert(schema.muMembers)
      .values(userIds.map((userId) => ({ muId, userId, role: null, updatedAt: NOW })));
  }
}

describe("runMuFightPoll", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
    fightStateFingerprintCache.clear();
  });

  it("batch-fetches watched MU members and stores parsed fight snapshots", async () => {
    await seedWatchedMu(db, "mu-1", ["u1", "u2"]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: fightFixture("u1") },
      { ok: true as const, data: fightFixture("u2", undefined) },
    ]);

    const result = await runMuFightPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });

    expect(result).toMatchObject({ userCount: 2, muCount: 1, status: "success" });
    expect(requestBatch).toHaveBeenCalledWith([
      { procedure: "user.getUserById", input: { userId: "u1" } },
      { procedure: "user.getUserById", input: { userId: "u2" } },
    ]);
    const snapshots = await db.select().from(schema.userFightSnapshots);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((row) => row.muId)).toEqual(["mu-1", "mu-1"]);
    expect(snapshots[0]).toMatchObject({
      userId: "u1",
      username: "fighter-u1",
      atk: 1_234,
      precision: 0.82,
      pillStatus: "active",
      recordedAt: NOW,
    });
  });

  it("warms fingerprints from DB after an in-process cache reset", async () => {
    await seedWatchedMu(db, "mu-1", ["u1"]);
    const requestBatch = vi.fn(async () => [{ ok: true as const, data: fightFixture("u1") }]);
    const options = {
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
    };

    await runMuFightPoll({ ...options, now: NOW });
    fightStateFingerprintCache.clear();
    const second = await runMuFightPoll({
      ...options,
      now: new Date(NOW.getTime() + 5 * 60_000),
    });

    expect(second.userCount).toBe(0);
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(1);
    expect(await db.select().from(schema.userFightPolls)).toHaveLength(2);
  });

  it("rejects a batch payload whose user id does not match its requested slot", async () => {
    await seedWatchedMu(db, "mu-1", ["u1"]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: fightFixture("different-user") },
    ]);

    const result = await runMuFightPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });

    expect(result).toMatchObject({ userCount: 0, muCount: 1, status: "error" });
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(0);
  });
});
