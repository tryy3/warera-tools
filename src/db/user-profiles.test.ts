import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import * as schema from "./schema";
import {
  getLatestUserProfile,
  insertUserProfilePoll,
  insertUserProfileSnapshots,
  listDistinctWatchedMuMemberUserIds,
} from "./user-profiles";

describe("user-profiles db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("lists distinct member user ids across watched MUs", async () => {
    const at = new Date("2026-09-04T12:00:00.000Z");
    await db.insert(schema.mus).values([
      { id: "mu-1", name: "One", enqueuedAt: at },
      { id: "mu-2", name: "Two", enqueuedAt: at },
      { id: "mu-unwatched", name: "Other", enqueuedAt: at },
    ]);
    await db.insert(schema.muWatchReasons).values([
      {
        muId: "mu-1",
        reason: "manual",
        sourceId: "",
        lastTouchedAt: at,
        createdAt: at,
      },
      {
        muId: "mu-2",
        reason: "follow_player",
        sourceId: "player-1",
        lastTouchedAt: at,
        createdAt: at,
      },
    ]);
    await db.insert(schema.muMembers).values([
      { muId: "mu-1", userId: "user-shared", role: null, updatedAt: at },
      { muId: "mu-1", userId: "user-1", role: null, updatedAt: at },
      { muId: "mu-2", userId: "user-shared", role: null, updatedAt: at },
      { muId: "mu-2", userId: "user-2", role: null, updatedAt: at },
      { muId: "mu-unwatched", userId: "ignored", role: null, updatedAt: at },
    ]);

    const result = await listDistinctWatchedMuMemberUserIds(db);

    expect(new Set(result.userIds)).toEqual(new Set(["user-shared", "user-1", "user-2"]));
    expect(result.muCount).toBe(2);
  });

  it("inserts polls and snapshots and returns the latest profile", async () => {
    const pollId = await insertUserProfilePoll(db, {
      recordedAt: new Date("2026-09-04T12:00:00.000Z"),
      status: "success",
      userCount: 2,
      muCount: 1,
    });
    const base = {
      avatarUrl: null,
      countryId: null,
      muId: "mu-1",
      companyId: null,
      partyId: null,
      isActive: true,
      lastConnectionAt: null,
      lastWorkAt: null,
      lastHelpAskedAt: null,
      lastDailyRewardClaimedAt: null,
      lastCompanyJoinedAt: null,
      lastDailyCalendarClaimedAt: null,
      lastSkillsResetAt: null,
      level: null,
      totalXp: null,
      dailyXpLeft: null,
      availableSkillPoints: null,
      spentSkillPoints: null,
      totalSkillPoints: null,
      prestigeLevel: null,
      militaryRank: null,
      isPremium: null,
      premiumMonthsCount: null,
      createdAtGame: null,
    };
    await insertUserProfileSnapshots(db, pollId, [
      {
        ...base,
        userId: "user-1",
        recordedAt: new Date("2026-09-04T12:05:00.000Z"),
        username: "Older",
      },
      {
        ...base,
        userId: "user-1",
        recordedAt: new Date("2026-09-04T12:10:00.000Z"),
        username: "Newest",
        level: 42,
      },
    ]);

    const latest = await getLatestUserProfile(db, "user-1");

    expect(pollId).toBeGreaterThan(0);
    expect(latest).toMatchObject({
      pollId,
      userId: "user-1",
      recordedAt: new Date("2026-09-04T12:10:00.000Z"),
      username: "Newest",
      level: 42,
    });
    expect(latest?.id).toBeGreaterThan(0);
  });

  it("returns an empty result for an empty watchlist", async () => {
    await expect(listDistinctWatchedMuMemberUserIds(db)).resolves.toEqual({
      userIds: [],
      muCount: 0,
    });
  });
});
