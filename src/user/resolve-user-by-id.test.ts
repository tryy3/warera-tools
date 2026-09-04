import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { insertUserProfilePoll, insertUserProfileSnapshots } from "../db/user-profiles";
import type { WareraRequester } from "../warera/prices";
import { resolveUserByIdRef } from "./resolve-user-by-id";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "resolve-user-by-id-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE user_profile_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      user_count INTEGER NOT NULL DEFAULT 0,
      mu_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE user_profile_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES user_profile_polls(id),
      user_id TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      username TEXT,
      avatar_url TEXT,
      country_id TEXT,
      mu_id TEXT,
      company_id TEXT,
      party_id TEXT,
      is_active INTEGER,
      last_connection_at INTEGER,
      last_work_at INTEGER,
      last_help_asked_at INTEGER,
      last_daily_reward_claimed_at INTEGER,
      last_company_joined_at INTEGER,
      last_daily_calendar_claimed_at INTEGER,
      last_skills_reset_at INTEGER,
      level INTEGER,
      total_xp INTEGER,
      daily_xp_left INTEGER,
      available_skill_points INTEGER,
      spent_skill_points INTEGER,
      total_skill_points INTEGER,
      prestige_level INTEGER,
      military_rank INTEGER,
      is_premium INTEGER,
      premium_months_count INTEGER,
      created_at_game INTEGER
    )
  `);
  return drizzle(client, { schema });
}

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

  beforeEach(async () => {
    db = await createDb();
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
