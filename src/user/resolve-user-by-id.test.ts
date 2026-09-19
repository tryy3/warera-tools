import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import { createTestDb, truncateAllTables } from "../db/test/postgres";
import * as schema from "../db/schema";
import { insertUserProfilePoll, insertUserProfileSnapshots } from "../db/user-profiles";
import type { WareraRequester } from "../warera/prices";
import { resolveUserByIdRef } from "./resolve-user-by-id";

const nullableProfileFields = {
  avatarUrl: null,
  countryId: null,
  partyId: null,
  isActive: null,
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

describe("resolveUserByIdRef", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  async function insertSnapshot(recordedAt: Date): Promise<void> {
    const pollId = await insertUserProfilePoll(db, {
      recordedAt,
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    await insertUserProfileSnapshots(db, pollId, [
      {
        ...nullableProfileFields,
        userId: "user-1",
        recordedAt,
        username: "Snapshot Alice",
        muId: "mu-snapshot",
        companyId: "company-snapshot",
      },
    ]);
  }

  function createWarera(): WareraRequester {
    return {
      request: vi.fn(
        async () =>
          ({
            result: {
              data: {
                _id: "user-1",
                username: "API Alice",
                mu: "mu-api",
                company: "company-api",
              },
            },
          }) as never,
      ),
      requestBatch: vi.fn(async () => []),
    };
  }

  it("returns a fresh snapshot without calling WarEra", async () => {
    await insertSnapshot(new Date("2026-09-04T12:00:00.000Z"));
    const warera = createWarera();

    const result = await resolveUserByIdRef({
      db,
      warera,
      userId: "user-1",
      maxAgeMs: 60_000,
      now: new Date("2026-09-04T12:00:30.000Z"),
    });

    expect(result).toEqual({
      userId: "user-1",
      username: "Snapshot Alice",
      muId: "mu-snapshot",
      companyId: "company-snapshot",
    });
    expect(warera.request).not.toHaveBeenCalled();
    expect(warera.requestBatch).not.toHaveBeenCalled();
  });

  it("falls back to WarEra when no snapshot exists", async () => {
    const warera = createWarera();

    const result = await resolveUserByIdRef({ db, warera, userId: "user-1" });

    expect(result).toEqual({
      userId: "user-1",
      username: "API Alice",
      muId: "mu-api",
      companyId: "company-api",
    });
    expect(warera.request).toHaveBeenCalledWith(expect.stringContaining("user.getUserById"));
  });

  it("falls back to WarEra when the snapshot is older than maxAgeMs", async () => {
    await insertSnapshot(new Date("2026-09-04T12:00:00.000Z"));
    const warera = createWarera();

    const result = await resolveUserByIdRef({
      db,
      warera,
      userId: "user-1",
      maxAgeMs: 60_000,
      now: new Date("2026-09-04T12:01:01.000Z"),
    });

    expect(result.username).toBe("API Alice");
    expect(warera.request).toHaveBeenCalledOnce();
  });

  it("does not insert a snapshot after the API fallback", async () => {
    const warera = createWarera();
    const before = await db.select().from(schema.userProfileSnapshots);

    await resolveUserByIdRef({ db, warera, userId: "user-1" });

    const after = await db.select().from(schema.userProfileSnapshots);
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(0);
  });
});
