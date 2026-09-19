import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import * as schema from "../../db/schema";
import { runMuMemberPoll, userProfileFingerprintCache } from "./run";

const NOW = new Date("2026-09-04T12:00:00.000Z");

function profileFixture(userId: string) {
  return {
    _id: userId,
    username: `user-${userId}`,
    avatarUrl: `https://example.test/${userId}.png`,
    country: "country-1",
    mu: "mu-1",
    company: "company-1",
    party: "party-1",
    isActive: true,
    dates: {
      lastConnectionAt: "2026-09-04T11:00:00.000Z",
      lastWorkAt: "2026-09-04T10:00:00.000Z",
    },
    leveling: {
      level: 42,
      totalXp: 12_345,
      dailyXpLeft: 100,
      availableSkillPoints: 2,
      spentSkillPoints: 8,
      totalSkillPoints: 10,
      prestigeLevel: 3,
    },
    militaryRank: 7,
    infos: { isPremium: true, premiumMonthsCount: 4 },
    createdAt: "2026-01-01T00:00:00.000Z",
    unexpected: "must not be persisted",
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
    await db.insert(schema.muMembers).values(
      userIds.map((userId) => ({
        muId,
        userId,
        role: null,
        updatedAt: NOW,
      })),
    );
  }
}

describe("runMuMemberPoll", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
    userProfileFingerprintCache.clear();
  });

  it("writes two profile snapshots for members of a watched MU in one batch", async () => {
    await seedWatchedMu(db, "mu-1", ["u1", "u2"]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: profileFixture("u1") },
      { ok: true as const, data: profileFixture("u2") },
    ]);

    const result = await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });

    expect(result).toMatchObject({ userCount: 2, muCount: 1, status: "success" });
    expect(requestBatch).toHaveBeenCalledOnce();
    expect(requestBatch).toHaveBeenCalledWith([
      { procedure: "user.getUserById", input: { userId: "u1" } },
      { procedure: "user.getUserById", input: { userId: "u2" } },
    ]);
    const snapshots = await db.select().from(schema.userProfileSnapshots);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((row) => row.recordedAt)).toEqual([NOW, NOW]);
    expect(snapshots.map((row) => row.username)).toEqual(["user-u1", "user-u2"]);
  });

  it("marks the poll partial and persists successful batch slots", async () => {
    await seedWatchedMu(db, "mu-1", ["u1", "u2"]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: profileFixture("u1") },
      { ok: false as const, error: new Error("lookup failed") },
    ]);

    const result = await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });

    expect(result).toMatchObject({ userCount: 1, muCount: 1, status: "partial" });
    expect(await db.select().from(schema.userProfileSnapshots)).toHaveLength(1);
    const polls = await db.select().from(schema.userProfilePolls);
    expect(polls[0]?.error).toContain("user u2");
  });

  it.each([
    ["no watched MUs", false],
    ["a watched MU with an empty roster", true],
  ])("writes a no-op success for %s without calling WarEra", async (_case, seedWatch) => {
    if (seedWatch) await seedWatchedMu(db, "mu-1", []);
    const requestBatch = vi.fn();

    const result = await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });

    expect(result).toMatchObject({
      userCount: 0,
      muCount: seedWatch ? 1 : 0,
      status: "success",
    });
    expect(requestBatch).not.toHaveBeenCalled();
    const polls = await db.select().from(schema.userProfilePolls);
    expect(polls).toHaveLength(1);
    expect(polls[0]?.userCount).toBe(0);
  });

  it("second identical poll writes poll row but zero new snapshots", async () => {
    await seedWatchedMu(db, "mu-1", ["u1"]);
    const requestBatch = vi.fn(async () => [{ ok: true as const, data: profileFixture("u1") }]);
    await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });
    await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: new Date(NOW.getTime() + 5 * 60_000),
    });
    expect(await db.select().from(schema.userProfileSnapshots)).toHaveLength(1);
    const polls = await db.select().from(schema.userProfilePolls);
    expect(polls).toHaveLength(2);
    expect(polls[1]?.userCount).toBe(0);
  });

  it("writes when a stored field changes", async () => {
    await seedWatchedMu(db, "mu-1", ["u1"]);
    const requestBatchFirst = vi.fn(async () => [
      { ok: true as const, data: profileFixture("u1") },
    ]);
    await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch: requestBatchFirst } as never,
      logger: makeLogger() as never,
      now: NOW,
    });

    const changed = profileFixture("u1");
    changed.leveling = { ...changed.leveling, totalXp: 12_346 };
    const requestBatchSecond = vi.fn(async () => [{ ok: true as const, data: changed }]);
    await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch: requestBatchSecond } as never,
      logger: makeLogger() as never,
      now: new Date(NOW.getTime() + 5 * 60_000),
    });

    expect(await db.select().from(schema.userProfileSnapshots)).toHaveLength(2);
    const polls = await db.select().from(schema.userProfilePolls);
    expect(polls).toHaveLength(2);
    expect(polls[1]?.userCount).toBe(1);
  });

  it("after cache.clear(), warms from DB and skips identical rewrite", async () => {
    await seedWatchedMu(db, "mu-1", ["u1"]);
    const requestBatch = vi.fn(async () => [{ ok: true as const, data: profileFixture("u1") }]);
    await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });
    userProfileFingerprintCache.clear();
    await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: new Date(NOW.getTime() + 5 * 60_000),
    });
    expect(await db.select().from(schema.userProfileSnapshots)).toHaveLength(1);
    const polls = await db.select().from(schema.userProfilePolls);
    expect(polls).toHaveLength(2);
    expect(polls[1]?.userCount).toBe(0);
  });

  it("marks the poll error when every batch slot fails", async () => {
    await seedWatchedMu(db, "mu-1", ["u1", "u2"]);
    const requestBatch = vi.fn(async () => [
      { ok: false as const, error: new Error("first failed") },
      { ok: false as const, error: new Error("second failed") },
    ]);

    const result = await runMuMemberPoll({
      db,
      warera: { request: vi.fn(), requestBatch } as never,
      logger: makeLogger() as never,
      now: NOW,
    });

    expect(result).toMatchObject({ userCount: 0, muCount: 1, status: "error" });
    expect(await db.select().from(schema.userProfileSnapshots)).toHaveLength(0);
    const polls = await db.select().from(schema.userProfilePolls);
    expect(polls[0]?.status).toBe("error");
    expect(polls[0]?.error).toContain("user u1");
    expect(polls[0]?.error).toContain("user u2");
  });
});
