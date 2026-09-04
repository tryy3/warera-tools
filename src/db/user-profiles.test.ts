import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import {
  getLatestUserProfile,
  insertUserProfilePoll,
  insertUserProfileSnapshots,
  listDistinctWatchedMuMemberUserIds,
} from "./user-profiles";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "user-profiles-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mus (
      id TEXT PRIMARY KEY,
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

describe("user-profiles db", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
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
