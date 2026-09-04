import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { upsertMuCurrent } from "../../db/mus";
import { upsertPlayerCurrent } from "../../db/players";
import { insertUserProfilePoll, insertUserProfileSnapshots } from "../../db/user-profiles";
import * as schema from "../../db/schema";
import type { ParsedMu } from "../../warera/mu";
import {
  MANUAL_SOURCE_ID,
  WATCH_REASON_FOLLOW_PLAYER,
  WATCH_REASON_MANUAL,
  insertMuWatchReason,
  insertPlayerWatchReason,
} from "../../db/watch-reasons";
import { unwrapTrpcData, wareraProcedurePath } from "../../warera/trpc";
import type { WareraBatchItem } from "../../warera/trpc";
import { errorPayload } from "../errors";
import { followRoutes } from "./follow";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "follow-route-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY NOT NULL,
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

function appFor(db: Db, request: (path: string) => Promise<unknown>) {
  const requestBatch = async (items: WareraBatchItem[]) => {
    const out = [];
    for (const item of items) {
      try {
        const path = wareraProcedurePath(
          item.procedure,
          (item.input ?? {}) as Record<string, unknown>,
        );
        const json = await request(path);
        out.push({ ok: true as const, data: unwrapTrpcData(json) });
      } catch (err) {
        out.push({
          ok: false as const,
          error: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    return out;
  };

  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route("/", followRoutes({ db, warera: { request, requestBatch } as never }));
  return app;
}

function userByIdResponse(
  userId: string,
  opts: { username?: string; muId?: string | null; companyId?: string | null } = {},
) {
  return {
    result: {
      data: {
        _id: userId,
        username: opts.username ?? "Alice",
        mu: opts.muId === undefined ? "mu1" : opts.muId,
        company: opts.companyId === undefined ? "c1" : opts.companyId,
      },
    },
  };
}

function muByIdResponse(muId: string, name = "Sweed Liberty") {
  return {
    result: {
      data: {
        _id: muId,
        name,
        leveling: { level: 5 },
        members: ["u1"],
        roles: {},
        activeUpgradeLevels: {},
        rankings: {},
      },
    },
  };
}

function sampleParsedMu(overrides: Partial<ParsedMu> = {}): ParsedMu {
  return {
    id: "mu1",
    name: "Sweed Liberty",
    avatarUrl: null,
    countryId: null,
    regionId: null,
    ownerUserId: null,
    mercenaryReputation: null,
    level: 5,
    createdAtGame: null,
    memberUserIds: ["u1"],
    roles: null,
    activeUpgradeLevels: null,
    payload: null,
    stats: {
      weeklyDamages: null,
      weeklyDamagesRank: null,
      weeklyDamagesTier: null,
      bounty: null,
      bountyRank: null,
      bountyTier: null,
      reputation: null,
      reputationRank: null,
      reputationTier: null,
      damages: null,
      damagesRank: null,
      damagesTier: null,
      terrain: null,
      terrainRank: null,
      terrainTier: null,
      wealth: null,
      wealthRank: null,
      wealthTier: null,
      levelingLevel: null,
      levelingMonthlyDamages: null,
    },
    ...overrides,
  };
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

describe("followRoutes — players", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
  });

  describe("GET /players", () => {
    it("returns empty list when nothing followed", async () => {
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/players");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { players: unknown[] };
      expect(body.players).toEqual([]);
      expect(request).not.toHaveBeenCalled();
    });

    it("joins players rows with their watch reasons", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      await insertPlayerWatchReason(db, {
        playerId: "p1",
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at,
      });
      await upsertPlayerCurrent(db, {
        id: "p1",
        username: "alice",
        muId: "mu1",
        workplaceCompanyId: "c1",
        payload: null,
        fetchedAt: at,
      });

      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/players");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        players: Array<{
          playerId: string;
          username: string | null;
          muId: string | null;
          workplaceCompanyId: string | null;
          reasons: Array<{ reason: string; sourceId: string }>;
        }>;
      };
      expect(body.players).toHaveLength(1);
      expect(body.players[0]).toEqual({
        playerId: "p1",
        username: "alice",
        muId: "mu1",
        workplaceCompanyId: "c1",
        reasons: [{ reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID }],
      });
      expect(request).not.toHaveBeenCalled();
    });

    it("returns null profile fields when player not yet synced", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      await insertPlayerWatchReason(db, {
        playerId: "p2",
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at,
      });

      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/players");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        players: Array<{ playerId: string; username: null; muId: null; workplaceCompanyId: null }>;
      };
      expect(body.players[0]).toEqual({
        playerId: "p2",
        username: null,
        muId: null,
        workplaceCompanyId: null,
        reasons: [{ reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID }],
      });
    });
  });

  describe("POST /players", () => {
    it("400s on missing playerId", async () => {
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("invalid_body");
      expect(request).not.toHaveBeenCalled();
    });

    it("400s on empty playerId", async () => {
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "   " }),
      });
      expect(res.status).toBe(400);
      expect(request).not.toHaveBeenCalled();
    });

    it("fetches user by id, inserts manual reason, upserts player, reconciles MU", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("user.getUserById")) {
          return userByIdResponse("p1", { username: "alice", muId: "mu9", companyId: "c9" });
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const res = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        player: {
          playerId: string;
          username: string | null;
          muId: string | null;
          workplaceCompanyId: string | null;
          reasons: Array<{ reason: string; sourceId: string }>;
        };
      };
      expect(body.player).toEqual({
        playerId: "p1",
        username: "alice",
        muId: "mu9",
        workplaceCompanyId: "c9",
        reasons: [{ reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID }],
      });

      const calls = request.mock.calls.map((c) => String(c[0]));
      expect(calls.some((p) => p.includes("user.getUserById"))).toBe(true);
      expect(calls.some((p) => p.includes("search."))).toBe(false);
    });

    it("adds a player from a fresh profile snapshot without calling WarEra", async () => {
      const recordedAt = new Date();
      const pollId = await insertUserProfilePoll(db, {
        recordedAt,
        status: "success",
        userCount: 1,
        muCount: 1,
      });
      await insertUserProfileSnapshots(db, pollId, [
        {
          ...nullableProfileFields,
          userId: "p1",
          recordedAt,
          username: "snapshot-alice",
          muId: "mu-snapshot",
          companyId: "company-snapshot",
        },
      ]);
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });

      const res = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1" }),
      });

      expect(res.status).toBe(200);
      expect(request).not.toHaveBeenCalled();
      const body = (await res.json()) as {
        player: {
          playerId: string;
          username: string | null;
          muId: string | null;
          workplaceCompanyId: string | null;
        };
      };
      expect(body.player).toMatchObject({
        playerId: "p1",
        username: "snapshot-alice",
        muId: "mu-snapshot",
        workplaceCompanyId: "company-snapshot",
      });
    });

    it("is idempotent on duplicate POST and reconciles MU", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("user.getUserById")) {
          return userByIdResponse("p1", { username: "alice" });
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const first = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1" }),
      });
      expect(first.status).toBe(200);

      const second = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1" }),
      });
      expect(second.status).toBe(200);

      const muReasons = await db.select().from(schema.muWatchReasons);
      const followRows = muReasons.filter(
        (r) => r.reason === WATCH_REASON_FOLLOW_PLAYER && r.sourceId === "p1",
      );
      expect(followRows).toHaveLength(1);
      expect(followRows[0].muId).toBe("mu1");
    });

    it("404s when getUserById is not found and leaves no reason behind", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("user.getUserById")) {
          throw new Error("WarEra request failed: 404 NOT_FOUND");
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const res = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1" }),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("not_found");

      const rows = await db.select().from(schema.playerWatchReasons);
      expect(rows).toHaveLength(0);
    });

    it("502s when getUserById fails for a non-404 reason and leaves no reason behind", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("user.getUserById")) {
          throw new Error("upstream down");
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const res = await appFor(db, request).request("http://localhost/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "p1" }),
      });
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("upstream_error");

      const rows = await db.select().from(schema.playerWatchReasons);
      expect(rows).toHaveLength(0);
    });
  });

  describe("DELETE /players/:playerId", () => {
    it("404s when no player reason rows existed", async () => {
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/players/ghost", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("not_found");
      expect(request).not.toHaveBeenCalled();
    });

    it("deletes player watch reasons and follow_player MU reasons, returns ok", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      await insertPlayerWatchReason(db, {
        playerId: "p1",
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at,
      });
      await insertMuWatchReason(db, {
        muId: "mu1",
        reason: WATCH_REASON_FOLLOW_PLAYER,
        sourceId: "p1",
        at,
      });
      await insertMuWatchReason(db, {
        muId: "mu1",
        reason: WATCH_REASON_FOLLOW_PLAYER,
        sourceId: "p2",
        at,
      });

      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/players/p1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      const playerRows = await db.select().from(schema.playerWatchReasons);
      expect(playerRows).toHaveLength(0);
      const muRows = await db.select().from(schema.muWatchReasons);
      expect(muRows).toHaveLength(1);
      expect(muRows[0].sourceId).toBe("p2");
    });
  });
});

describe("followRoutes — mus", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createDb();
  });

  describe("GET /mus", () => {
    it("returns empty list when nothing watched", async () => {
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/mus");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { mus: unknown[] };
      expect(body.mus).toEqual([]);
      expect(request).not.toHaveBeenCalled();
    });

    it("joins mus rows with reasons and sourceUsername for follow_player", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      await upsertMuCurrent(db, sampleParsedMu({ id: "mu1", name: "Sweed Liberty" }), at);
      await upsertPlayerCurrent(db, {
        id: "p1",
        username: "alice",
        muId: "mu1",
        workplaceCompanyId: null,
        payload: null,
        fetchedAt: at,
      });
      await insertMuWatchReason(db, {
        muId: "mu1",
        reason: WATCH_REASON_FOLLOW_PLAYER,
        sourceId: "p1",
        at,
      });
      await insertMuWatchReason(db, {
        muId: "mu1",
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at,
      });

      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/mus");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        mus: Array<{
          muId: string;
          name: string | null;
          reasons: Array<{
            reason: string;
            sourceId: string;
            sourceUsername: string | null;
          }>;
        }>;
      };
      expect(body.mus).toHaveLength(1);
      expect(body.mus[0].muId).toBe("mu1");
      expect(body.mus[0].name).toBe("Sweed Liberty");
      const reasons = body.mus[0].reasons;
      expect(reasons).toContainEqual({
        reason: WATCH_REASON_FOLLOW_PLAYER,
        sourceId: "p1",
        sourceUsername: "alice",
      });
      expect(reasons).toContainEqual({
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        sourceUsername: null,
      });
    });

    it("returns null name when mu not yet synced", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      await insertMuWatchReason(db, {
        muId: "mu2",
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at,
      });

      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/mus");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        mus: Array<{ muId: string; name: null }>;
      };
      expect(body.mus[0].muId).toBe("mu2");
      expect(body.mus[0].name).toBeNull();
    });
  });

  describe("POST /mus", () => {
    it("400s on missing muId", async () => {
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      expect(request).not.toHaveBeenCalled();
    });

    it("400s on empty muId", async () => {
      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muId: "  " }),
      });
      expect(res.status).toBe(400);
      expect(request).not.toHaveBeenCalled();
    });

    it("fetches MU first, then inserts manual reason and upserts MU", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("mu.getById")) {
          return muByIdResponse("mu1", "Sweed Liberty");
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const res = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muId: "mu1" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        mu: {
          muId: string;
          name: string | null;
          reasons: Array<{ reason: string; sourceId: string; sourceUsername: string | null }>;
        };
      };
      expect(body.mu.muId).toBe("mu1");
      expect(body.mu.name).toBe("Sweed Liberty");
      expect(body.mu.reasons).toEqual([
        { reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID, sourceUsername: null },
      ]);

      const muRows = await db.select().from(schema.mus);
      expect(muRows).toHaveLength(1);
      expect(muRows[0].name).toBe("Sweed Liberty");
    });

    it("does not leave a dangling manual reason when getById fails with upstream error", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("mu.getById")) {
          throw new Error("upstream down");
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const res = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muId: "mu1" }),
      });
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("upstream_error");

      const muReasonRows = await db.select().from(schema.muWatchReasons);
      expect(muReasonRows).toHaveLength(0);
      const muRows = await db.select().from(schema.mus);
      expect(muRows).toHaveLength(0);
    });

    it("404s when getById is not found", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("mu.getById")) {
          throw new Error("WarEra request failed: 404 NOT_FOUND");
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const res = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muId: "ghost" }),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("not_found");
      expect(await db.select().from(schema.muWatchReasons)).toHaveLength(0);
    });

    it("skips live fetch when mus row is already warm", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      await upsertMuCurrent(
        db,
        {
          id: "mu1",
          name: "Cached MU",
          avatarUrl: null,
          countryId: null,
          regionId: null,
          ownerUserId: null,
          mercenaryReputation: null,
          level: null,
          createdAtGame: null,
          memberUserIds: [],
          roles: null,
          activeUpgradeLevels: null,
          payload: null,
          stats: {
            weeklyDamages: null,
            weeklyDamagesRank: null,
            weeklyDamagesTier: null,
            bounty: null,
            bountyRank: null,
            bountyTier: null,
            reputation: null,
            reputationRank: null,
            reputationTier: null,
            damages: null,
            damagesRank: null,
            damagesTier: null,
            terrain: null,
            terrainRank: null,
            terrainTier: null,
            wealth: null,
            wealthRank: null,
            wealthTier: null,
            levelingLevel: null,
            levelingMonthlyDamages: null,
          },
        } satisfies ParsedMu,
        at,
      );

      const request = vi.fn(async () => {
        throw new Error("should not call warera when mus is warm");
      });

      const res = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muId: "mu1" }),
      });
      expect(res.status).toBe(200);
      expect(request).not.toHaveBeenCalled();
      const body = (await res.json()) as { mu: { muId: string; name: string | null } };
      expect(body.mu.muId).toBe("mu1");
      expect(body.mu.name).toBe("Cached MU");
      const reasons = await db.select().from(schema.muWatchReasons);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]?.reason).toBe(WATCH_REASON_MANUAL);
    });

    it("is idempotent on duplicate POST", async () => {
      const request = vi.fn(async (path: string) => {
        if (path.includes("mu.getById")) {
          return muByIdResponse("mu1", "Sweed Liberty");
        }
        throw new Error(`unexpected warera call: ${path}`);
      });

      const first = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muId: "mu1" }),
      });
      expect(first.status).toBe(200);

      const second = await appFor(db, request).request("http://localhost/mus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muId: "mu1" }),
      });
      expect(second.status).toBe(200);

      const muReasonRows = await db.select().from(schema.muWatchReasons);
      expect(muReasonRows).toHaveLength(1);
    });
  });

  describe("DELETE /mus/:muId", () => {
    it("404s when the manual row did not exist", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      // only a follow_player row exists, not manual
      await insertMuWatchReason(db, {
        muId: "mu1",
        reason: WATCH_REASON_FOLLOW_PLAYER,
        sourceId: "p1",
        at,
      });

      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/mus/mu1", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("not_found");

      // follow_player row stays
      const muRows = await db.select().from(schema.muWatchReasons);
      expect(muRows).toHaveLength(1);
      expect(muRows[0].reason).toBe(WATCH_REASON_FOLLOW_PLAYER);
    });

    it("deletes only the manual row, keeps follow_player rows", async () => {
      const at = new Date("2026-08-21T00:00:00.000Z");
      await insertMuWatchReason(db, {
        muId: "mu1",
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at,
      });
      await insertMuWatchReason(db, {
        muId: "mu1",
        reason: WATCH_REASON_FOLLOW_PLAYER,
        sourceId: "p1",
        at,
      });

      const request = vi.fn(async () => {
        throw new Error("should not call warera");
      });
      const res = await appFor(db, request).request("http://localhost/mus/mu1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      const muRows = await db.select().from(schema.muWatchReasons);
      expect(muRows).toHaveLength(1);
      expect(muRows[0].reason).toBe(WATCH_REASON_FOLLOW_PLAYER);
      expect(muRows[0].sourceId).toBe("p1");
    });
  });
});
