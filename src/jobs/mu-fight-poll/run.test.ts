import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import * as schema from "../../db/schema";
import { fightStateFingerprintCache, runMuFightPoll } from "./run";

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
  await db.insert(schema.mus).values({ id: muId, enqueuedAt: NOW }).onConflictDoNothing();
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

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
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
