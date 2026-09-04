import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import { insertUserProfilePoll, insertUserProfileSnapshots } from "../db/user-profiles";
import * as schema from "../db/schema";
import { muWatchReasons, players } from "../db/schema";
import {
  MANUAL_SOURCE_ID,
  WATCH_REASON_FOLLOW_PLAYER,
  WATCH_REASON_MANUAL,
  insertPlayerWatchReason,
  insertMuWatchReason,
} from "../db/watch-reasons";
import type { TrpcBatchSlotResult, WareraBatchItem } from "../warera/trpc";
import type { WareraRequester } from "../warera/prices";
import { syncFollowedPlayers } from "./sync-followed-players";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "sync-followed-players-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      username TEXT,
      mu_id TEXT,
      workplace_company_id TEXT,
      payload TEXT,
      fetched_at INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE player_watch_reasons (
      player_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, reason, source_id)
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

type SlotMap = Record<string, TrpcBatchSlotResult>;

function makeWarera(slots: SlotMap, requestFn?: ReturnType<typeof vi.fn>): WareraRequester {
  const requestBatch = vi.fn(async (items: WareraBatchItem[]) => {
    return items.map((item) => {
      const userId = (item.input as { userId?: string } | undefined)?.userId ?? "";
      return slots[userId] ?? { ok: false, error: "no slot" };
    });
  });
  const request =
    requestFn ??
    vi.fn(async (path: string) => {
      const query = path.split("?input=")[1];
      const input = query
        ? (JSON.parse(decodeURIComponent(query)) as { userId?: string })
        : undefined;
      const slot = slots[input?.userId ?? ""];
      if (!slot?.ok) {
        throw new Error(`user lookup failed: ${input?.userId ?? "unknown"}`);
      }
      return { result: { data: slot.data } };
    });
  return { request, requestBatch } as unknown as WareraRequester;
}

async function muRowsForMu(db: Db, muId: string) {
  return db
    .select({
      muId: muWatchReasons.muId,
      reason: muWatchReasons.reason,
      sourceId: muWatchReasons.sourceId,
    })
    .from(muWatchReasons)
    .where(eq(muWatchReasons.muId, muId))
    .orderBy(muWatchReasons.sourceId, muWatchReasons.reason);
}

async function playerRow(db: Db, id: string) {
  const rows = await db.select().from(players).where(eq(players.id, id));
  return rows[0] ?? null;
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

describe("syncFollowedPlayers", () => {
  let db: Db;
  const at = new Date("2026-08-21T00:00:00.000Z");

  beforeEach(async () => {
    db = await createDb();
  });

  it("returns empty result when there are no followed players", async () => {
    const warera = makeWarera({});
    const result = await syncFollowedPlayers({ db, warera, now: at });
    expect(result).toEqual({ playerCount: 0, errors: [] });
    expect(warera.requestBatch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("upserts player row and creates one follow_player reason for the MU", async () => {
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    const warera = makeWarera({
      p1: { ok: true, data: { _id: "p1", username: "alice", mu: "mu-1" } },
    });

    const result = await syncFollowedPlayers({ db, warera, now: at });

    expect(result).toEqual({ playerCount: 1, errors: [] });
    const p = await playerRow(db, "p1");
    expect(p?.username).toBe("alice");
    expect(p?.muId).toBe("mu-1");
    const mu1Rows = await muRowsForMu(db, "mu-1");
    expect(mu1Rows).toEqual([{ muId: "mu-1", reason: WATCH_REASON_FOLLOW_PLAYER, sourceId: "p1" }]);
  });

  it("uses a fresh profile snapshot without calling WarEra", async () => {
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    const pollId = await insertUserProfilePoll(db, {
      recordedAt: at,
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    await insertUserProfileSnapshots(db, pollId, [
      {
        ...nullableProfileFields,
        userId: "p1",
        recordedAt: at,
        username: "snapshot-alice",
        muId: "mu-snapshot",
        companyId: "company-snapshot",
      },
    ]);
    const warera = makeWarera({});

    const result = await syncFollowedPlayers({ db, warera, now: at });

    expect(result).toEqual({ playerCount: 1, errors: [] });
    expect(warera.request).not.toHaveBeenCalled();
    expect(warera.requestBatch).not.toHaveBeenCalled();
    expect(await playerRow(db, "p1")).toMatchObject({
      username: "snapshot-alice",
      muId: "mu-snapshot",
      workplaceCompanyId: "company-snapshot",
    });
  });

  it("moves the follow row when the player changes MU and keeps unrelated manual rows", async () => {
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    // First sync: p1 in mu-1
    let warera = makeWarera({
      p1: { ok: true, data: { _id: "p1", username: "alice", mu: "mu-1" } },
    });
    await syncFollowedPlayers({ db, warera, now: at });

    // Add a manual watch on mu-1 from a different source — must survive
    await insertMuWatchReason(db, {
      muId: "mu-1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });

    // Second sync: p1 now in mu-2
    warera = makeWarera({
      p1: { ok: true, data: { _id: "p1", username: "alice", mu: "mu-2" } },
    });
    const result = await syncFollowedPlayers({ db, warera, now: at });

    expect(result).toEqual({ playerCount: 1, errors: [] });
    const mu1Rows = await muRowsForMu(db, "mu-1");
    expect(mu1Rows).toEqual([
      { muId: "mu-1", reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID },
    ]);
    const mu2Rows = await muRowsForMu(db, "mu-2");
    expect(mu2Rows).toEqual([{ muId: "mu-2", reason: WATCH_REASON_FOLLOW_PLAYER, sourceId: "p1" }]);
    const p = await playerRow(db, "p1");
    expect(p?.muId).toBe("mu-2");
  });

  it("records an error and skips reconcile when a batch slot fails, without throwing", async () => {
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    const warera = makeWarera({
      p1: { ok: false, error: "boom" },
    });

    const result = await syncFollowedPlayers({ db, warera, now: at });

    expect(result.playerCount).toBe(0);
    expect(result.errors).toEqual(["player p1: lookup failed"]);
    const p = await playerRow(db, "p1");
    expect(p).toBeNull();
    const allMu = await db.select().from(muWatchReasons);
    expect(allMu).toHaveLength(0);
  });

  it("never calls request with a path containing search.", async () => {
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    const request = vi.fn(async (_path: string) => ({ result: { data: {} } }));
    const warera = makeWarera(
      { p1: { ok: true, data: { _id: "p1", username: "alice", mu: "mu-1" } } },
      request,
    );

    await syncFollowedPlayers({ db, warera, now: at });

    for (const call of request.mock.calls) {
      const path = String(call[0] ?? "");
      expect(path).not.toMatch(/search\./);
    }
  });

  it("falls back to a single request when requestBatch is missing", async () => {
    await insertPlayerWatchReason(db, {
      playerId: "p1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    const request = vi.fn(async () => ({
      result: { data: { _id: "p1", username: "alice", mu: "mu-1" } },
    }));
    const warera = { request } as unknown as WareraRequester;

    await expect(syncFollowedPlayers({ db, warera, now: at })).resolves.toEqual({
      playerCount: 1,
      errors: [],
    });
    expect(request).toHaveBeenCalledOnce();
  });
});
