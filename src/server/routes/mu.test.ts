import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import {
  insertMuMemberStatSnapshots,
  insertMuPoll,
  insertMuStatSnapshots,
} from "../../db/mu-stats";
import { replaceMuMembers, upsertMuCurrent } from "../../db/mus";
import { upsertPlayerCurrent } from "../../db/players";
import * as schema from "../../db/schema";
import { MANUAL_SOURCE_ID, WATCH_REASON_MANUAL, insertMuWatchReason } from "../../db/watch-reasons";
import type { ParsedMu } from "../../warera/mu";
import { unwrapTrpcData, wareraProcedurePath } from "../../warera/trpc";
import type { WareraBatchItem } from "../../warera/trpc";
import { errorPayload } from "../errors";
import { muRoutes } from "./mu";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mu-route-"));
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
    CREATE TABLE mu_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      mu_count INTEGER NOT NULL DEFAULT 0,
      member_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE mu_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      weekly_damages REAL,
      weekly_damages_rank INTEGER,
      weekly_damages_tier TEXT,
      bounty REAL,
      bounty_rank INTEGER,
      bounty_tier TEXT,
      reputation REAL,
      reputation_rank INTEGER,
      reputation_tier TEXT,
      damages REAL,
      damages_rank INTEGER,
      damages_tier TEXT,
      terrain REAL,
      terrain_rank INTEGER,
      terrain_tier TEXT,
      wealth REAL,
      wealth_rank INTEGER,
      wealth_tier TEXT,
      leveling_level INTEGER,
      leveling_monthly_damages REAL,
      payload TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE mu_member_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_row_id TEXT,
      total_damages_count INTEGER,
      monthly_damages_count INTEGER,
      weekly_damages_count INTEGER,
      total_help_count INTEGER,
      monthly_help_count INTEGER,
      weekly_help_count INTEGER,
      payload TEXT
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
  app.route(
    "/",
    muRoutes({
      db,
      warera: { request, requestBatch } as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    }),
  );
  return app;
}

function sampleParsedMu(overrides: Partial<ParsedMu> = {}): ParsedMu {
  return {
    id: "mu1",
    name: "Sweed Liberty",
    avatarUrl: "https://example.com/a.png",
    countryId: "c1",
    regionId: "r1",
    ownerUserId: "u1",
    mercenaryReputation: 42,
    level: 5,
    createdAtGame: null,
    memberUserIds: ["u1", "u2"],
    roles: { managers: [], commanders: ["u2"] },
    activeUpgradeLevels: null,
    payload: null,
    stats: {
      weeklyDamages: 1000,
      weeklyDamagesRank: 3,
      weeklyDamagesTier: "gold",
      bounty: 50,
      bountyRank: 10,
      bountyTier: "silver",
      reputation: 200,
      reputationRank: 5,
      reputationTier: "gold",
      damages: 5000,
      damagesRank: 2,
      damagesTier: "gold",
      terrain: 100,
      terrainRank: 8,
      terrainTier: "bronze",
      wealth: 300,
      wealthRank: 4,
      wealthTier: "gold",
      levelingLevel: 5,
      levelingMonthlyDamages: 800,
    },
    ...overrides,
  };
}

function muByIdResponse(parsed: ParsedMu) {
  return {
    result: {
      data: {
        _id: parsed.id,
        name: parsed.name,
        avatarUrl: parsed.avatarUrl,
        country: parsed.countryId,
        region: parsed.regionId,
        user: parsed.ownerUserId,
        mercenaryReputation: parsed.mercenaryReputation,
        leveling: { level: parsed.level, monthlyDamages: parsed.stats.levelingMonthlyDamages },
        members: parsed.memberUserIds,
        roles: parsed.roles ?? {},
        activeUpgradeLevels: parsed.activeUpgradeLevels ?? {},
        rankings: {
          muWeeklyDamages: {
            value: parsed.stats.weeklyDamages,
            rank: parsed.stats.weeklyDamagesRank,
            tier: parsed.stats.weeklyDamagesTier,
          },
          muBounty: {
            value: parsed.stats.bounty,
            rank: parsed.stats.bountyRank,
            tier: parsed.stats.bountyTier,
          },
          muReputation: {
            value: parsed.stats.reputation,
            rank: parsed.stats.reputationRank,
            tier: parsed.stats.reputationTier,
          },
          muDamages: {
            value: parsed.stats.damages,
            rank: parsed.stats.damagesRank,
            tier: parsed.stats.damagesTier,
          },
          muTerrain: {
            value: parsed.stats.terrain,
            rank: parsed.stats.terrainRank,
            tier: parsed.stats.terrainTier,
          },
          muWealth: {
            value: parsed.stats.wealth,
            rank: parsed.stats.wealthRank,
            tier: parsed.stats.wealthTier,
          },
        },
      },
    },
  };
}

function muMembersResponse(muId: string) {
  return {
    result: {
      data: [
        {
          _id: "m1",
          mu: muId,
          user: "u1",
          weeklyDamagesCount: 500,
          monthlyDamagesCount: 2000,
          totalDamagesCount: 10000,
          weeklyHelpCount: 3,
          monthlyHelpCount: 12,
          totalHelpCount: 50,
        },
        {
          _id: "m2",
          mu: muId,
          user: "u2",
          weeklyDamagesCount: 100,
          monthlyDamagesCount: 400,
          totalDamagesCount: 800,
          weeklyHelpCount: 1,
          monthlyHelpCount: 4,
          totalHelpCount: 10,
        },
      ],
    },
  };
}

describe("muRoutes — GET /:id", () => {
  let db: Db;
  const at = new Date("2026-08-21T12:00:00.000Z");

  beforeEach(async () => {
    db = await createDb();
  });

  it("warm path returns seeded MU, members, snapshots without warera", async () => {
    await upsertMuCurrent(db, sampleParsedMu(), at);
    await replaceMuMembers(
      db,
      "mu1",
      [
        { userId: "u1", role: "owner" },
        { userId: "u2", role: "commander" },
      ],
      at,
    );
    await upsertPlayerCurrent(db, {
      id: "u1",
      username: "alice",
      muId: "mu1",
      workplaceCompanyId: null,
      payload: null,
      fetchedAt: at,
    });
    await insertMuWatchReason(db, {
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });

    const pollId = await insertMuPoll(db, {
      recordedAt: at,
      status: "success",
      muCount: 1,
      memberCount: 2,
    });
    await insertMuStatSnapshots(db, pollId, [
      {
        muId: "mu1",
        weeklyDamages: 900,
        weeklyDamagesRank: 4,
        weeklyDamagesTier: "gold",
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
        levelingLevel: 5,
        levelingMonthlyDamages: 700,
        payload: null,
      },
    ]);
    await insertMuMemberStatSnapshots(db, pollId, [
      {
        muId: "mu1",
        userId: "u1",
        memberRowId: "m1",
        totalDamagesCount: 9000,
        monthlyDamagesCount: 1800,
        weeklyDamagesCount: 450,
        totalHelpCount: 45,
        monthlyHelpCount: 11,
        weeklyHelpCount: 2,
        payload: null,
      },
    ]);

    const request = vi.fn(async () => {
      throw new Error("should not call warera");
    });
    const res = await appFor(db, request).request("http://localhost/mu1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mu: {
        id: string;
        name: string | null;
        fetchedAt: string | null;
      };
      members: Array<{
        userId: string;
        role: string | null;
        username: string | null;
        latest: Record<string, number | null> | null;
      }>;
      latestMuStats: { weeklyDamages: number | null; weeklyDamagesRank: number | null } | null;
      meta: { watched: boolean; historyAvailable: boolean; liveFilled: boolean };
    };

    expect(body.mu.id).toBe("mu1");
    expect(body.mu.name).toBe("Sweed Liberty");
    expect(body.mu.fetchedAt).toBe(at.toISOString());
    expect(body.members).toEqual([
      {
        userId: "u1",
        role: "owner",
        username: "alice",
        latest: {
          totalDamagesCount: 9000,
          monthlyDamagesCount: 1800,
          weeklyDamagesCount: 450,
          totalHelpCount: 45,
          monthlyHelpCount: 11,
          weeklyHelpCount: 2,
        },
      },
      {
        userId: "u2",
        role: "commander",
        username: null,
        latest: null,
      },
    ]);
    expect(body.latestMuStats?.weeklyDamages).toBe(900);
    expect(body.latestMuStats?.weeklyDamagesRank).toBe(4);
    expect(body.meta).toEqual({
      watched: true,
      historyAvailable: true,
      liveFilled: false,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("cold path live-fills MU, roster, watch reason without snapshot rows", async () => {
    const parsed = sampleParsedMu();
    const request = vi.fn(async (path: string) => {
      if (path.includes("mu.getById")) return muByIdResponse(parsed);
      if (path.includes("muMember.getByMu")) return muMembersResponse("mu1");
      throw new Error(`unexpected warera call: ${path}`);
    });

    const res = await appFor(db, request).request("http://localhost/mu1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: Array<{ userId: string; latest: Record<string, number | null> | null }>;
      latestMuStats: { weeklyDamages: number | null; weeklyDamagesRank: number | null } | null;
      meta: { watched: boolean; historyAvailable: boolean; liveFilled: boolean };
    };

    expect(body.meta).toEqual({
      watched: true,
      historyAvailable: false,
      liveFilled: true,
    });
    expect(body.latestMuStats?.weeklyDamages).toBe(1000);
    expect(body.latestMuStats?.weeklyDamagesRank).toBe(3);
    expect(body.members.find((m) => m.userId === "u1")?.latest?.weeklyDamagesCount).toBe(500);

    const muRows = await db.select().from(schema.mus);
    expect(muRows).toHaveLength(1);
    expect(muRows[0]?.name).toBe("Sweed Liberty");

    const memberRows = await db.select().from(schema.muMembers);
    expect(memberRows).toHaveLength(2);

    const watchRows = await db.select().from(schema.muWatchReasons);
    expect(watchRows).toHaveLength(1);
    expect(watchRows[0]).toMatchObject({
      muId: "mu1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
    });

    const pollRows = await db.select().from(schema.muPolls);
    expect(pollRows).toHaveLength(0);
    const muSnapRows = await db.select().from(schema.muStatSnapshots);
    expect(muSnapRows).toHaveLength(0);
    const memberSnapRows = await db.select().from(schema.muMemberStatSnapshots);
    expect(memberSnapRows).toHaveLength(0);
  });

  it("404s when getById is not found and leaves no watch reason", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("mu.getById")) {
        throw new Error("WarEra request failed: 404 NOT_FOUND");
      }
      throw new Error(`unexpected warera call: ${path}`);
    });

    const res = await appFor(db, request).request("http://localhost/ghost");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");

    expect(await db.select().from(schema.muWatchReasons)).toHaveLength(0);
    expect(await db.select().from(schema.mus)).toHaveLength(0);
  });
});
