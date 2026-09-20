import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { computeBattleBonus } from "../../battle-bonus/compute";
import { insertBattlePoll } from "../../db/battle-stats";
import { replaceBattleOrders } from "../../db/battle-orders";
import type { Db } from "../../db/client";
import { upsertBattleFromParsed } from "../../db/battles";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import {
  FIGHT_PEAK_WINDOW_MS,
  insertUserFightPoll,
  insertUserFightSnapshots,
} from "../../db/user-fight-state";
import * as schema from "../../db/schema";
import type { ParsedBattle } from "../../warera/battles";
import type { TrpcBatchSlotResult, WareraBatchItem } from "../../warera/trpc";
import { errorPayload } from "../errors";
import * as fightDeskBattles from "../fight-desk-battles";
import { muFightDeskRoutes } from "./mu-fight-desk";

const NOW = new Date("2026-09-15T12:00:00.000Z");

function logger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

function appFor(
  db: Db,
  requestBatch?: (items: WareraBatchItem[]) => Promise<TrpcBatchSlotResult[]>,
) {
  const batch = requestBatch ?? vi.fn(async (_items: WareraBatchItem[]) => []);
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    muFightDeskRoutes({
      db,
      warera: { request: vi.fn(), requestBatch: batch } as never,
      logger: logger() as never,
    }),
  );
  return { app, requestBatch: batch };
}

async function seedMu(
  db: Db,
  userIds: string[],
  watched = false,
  muOverrides?: Partial<typeof schema.mus.$inferInsert>,
): Promise<void> {
  await db.insert(schema.mus).values({
    id: "mu-1",
    name: "First Unit",
    enqueuedAt: NOW,
    fetchedAt: NOW,
    ...muOverrides,
  });
  if (userIds.length > 0) {
    await db.insert(schema.muMembers).values(
      userIds.map((userId, index) => ({
        muId: "mu-1",
        userId,
        role: index === 0 ? "owner" : "member",
        updatedAt: NOW,
      })),
    );
  }
  if (watched) {
    await db.insert(schema.muWatchReasons).values({
      muId: "mu-1",
      reason: "manual",
      sourceId: "test",
      lastTouchedAt: NOW,
      createdAt: NOW,
    });
  }
}

function parsedFight(userId: string, username = `fighter-${userId}`) {
  return {
    userId,
    username,
    level: 42,
    militaryRankBonus: 0.35,
    ammoLabel: "Q5",
    pillLabel: "cocain",
    pillEndsAt: new Date("2026-09-15T13:00:00.000Z"),
    skillLevels: { attack: 11, health: 9 },
    lastSkillsResetAt: new Date("2026-09-01T00:00:00.000Z"),
    avatarUrl: `https://example.test/${userId}.png`,
    atk: 1_234,
    precision: 0.82,
    critChance: 0.24,
    critDamage: 2.66,
    armor: 480,
    dodge: 130,
    hp: 900,
    maxHp: 1_000,
    hunger: 88,
    maxHunger: 100,
    hpRegenPerHour: 60,
    hungerRegenPerHour: 12,
    pillStatus: "active" as const,
  };
}

function rawFight(userId: string) {
  return {
    _id: userId,
    username: `fighter-${userId}`,
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

describe("muFightDeskRoutes", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 for an unknown MU without loading battles", async () => {
    const loadSpy = vi.spyOn(fightDeskBattles, "loadFightDeskBattles");
    const { app } = appFor(db);

    const res = await app.request("http://localhost/mu-missing/fight-desk");

    expect(res.status).toBe(404);
    expect(loadSpy).not.toHaveBeenCalled();
    loadSpy.mockRestore();
  });

  it("returns an empty member list for an MU with an empty roster", async () => {
    await seedMu(db, []);
    const { app, requestBatch } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mu: { id: "mu-1", name: "First Unit" },
      asOf: null,
      members: [],
      battles: [],
      meta: { watched: false, liveFilled: false, refreshFailedUserIds: [] },
    });
    expect(requestBatch).not.toHaveBeenCalled();
  });

  it("marks a roster member without a snapshot incomplete", async () => {
    await seedMu(db, ["u1"]);
    const { app } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    expect(((await res.json()) as { members: unknown[] }).members).toEqual([
      {
        userId: "u1",
        username: null,
        level: null,
        role: "owner",
        incomplete: true,
        fight: null,
        peakFight: null,
        display: {
          avatarUrl: null,
          militaryRankBonus: null,
          ammoLabel: null,
          pillLabel: null,
          pillEndsAt: null,
          skillLevels: {},
        },
      },
    ]);
  });

  it("returns latest stored fight inputs and the newest snapshot time", async () => {
    await seedMu(db, ["u1", "u2"], true);
    const oldAt = new Date("2026-09-15T11:55:00.000Z");
    const pollId = await insertUserFightPoll(db, {
      recordedAt: oldAt,
      status: "success",
      userCount: 2,
      muCount: 1,
    });
    await insertUserFightSnapshots(db, pollId, [
      { ...parsedFight("u1", "alice"), muId: "mu-1", recordedAt: oldAt },
      { ...parsedFight("u2", "bob"), muId: "mu-1", recordedAt: NOW },
    ]);
    const { app, requestBatch } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asOf: string | null;
      members: Array<Record<string, unknown>>;
      meta: {
        watched: boolean;
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.asOf).toBe(NOW.toISOString());
    expect(body.meta).toEqual({
      watched: true,
      liveFilled: false,
      refreshFailedUserIds: [],
    });
    expect(body.members[0]).toMatchObject({
      userId: "u1",
      username: "alice",
      level: 42,
      role: "owner",
      incomplete: false,
      fight: {
        userId: "u1",
        atk: 1_234,
        precision: 0.82,
        pillStatus: "active",
      },
      peakFight: {
        userId: "u1",
        atk: 1_234,
        precision: 0.82,
        pillStatus: "active",
      },
      display: {
        avatarUrl: "https://example.test/u1.png",
        militaryRankBonus: 0.35,
        ammoLabel: "Q5",
        pillLabel: "cocain",
        pillEndsAt: "2026-09-15T13:00:00.000Z",
        skillLevels: { attack: 11, health: 9 },
      },
    });
    expect(body.members[0]?.display).not.toHaveProperty("lastSkillsResetAt");
    expect(requestBatch).not.toHaveBeenCalled();
  });

  it("returns 7d highest-ATK as peakFight and omits skills-reset from display", async () => {
    await seedMu(db, ["u1", "u2"]);
    const peakAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    const pollId = await insertUserFightPoll(db, {
      recordedAt: peakAt,
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    await insertUserFightSnapshots(db, pollId, [
      { ...parsedFight("u1", "alice"), atk: 2_500, muId: "mu-1", recordedAt: peakAt },
      { ...parsedFight("u1", "alice"), atk: 1_234, muId: "mu-1", recordedAt: NOW },
    ]);
    const { app } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: Array<{
        userId: string;
        incomplete: boolean;
        fight: { atk: number } | null;
        peakFight: { atk: number } | null;
        display: Record<string, unknown>;
      }>;
    };
    expect(body.members[0]).toMatchObject({
      userId: "u1",
      incomplete: false,
      fight: { atk: 1_234 },
      peakFight: { atk: 2_500 },
    });
    expect(body.members[0]?.display).not.toHaveProperty("lastSkillsResetAt");
    expect(body.members[1]).toMatchObject({
      userId: "u2",
      incomplete: true,
      fight: null,
      peakFight: null,
    });
    expect(body.members[1]?.display).not.toHaveProperty("lastSkillsResetAt");
  });

  it("does not let an out-of-window high-ATK snapshot win Peak", async () => {
    await seedMu(db, ["u1"]);
    const staleAt = new Date(NOW.getTime() - FIGHT_PEAK_WINDOW_MS - 24 * 60 * 60 * 1000);
    const pollId = await insertUserFightPoll(db, {
      recordedAt: staleAt,
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    await insertUserFightSnapshots(db, pollId, [
      { ...parsedFight("u1", "alice"), atk: 9_999, muId: "mu-1", recordedAt: staleAt },
      { ...parsedFight("u1", "alice"), atk: 1_234, muId: "mu-1", recordedAt: NOW },
    ]);
    const { app } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: Array<{ fight: { atk: number } | null; peakFight: { atk: number } | null }>;
    };
    expect(body.members[0]).toMatchObject({
      fight: { atk: 1_234 },
      peakFight: { atk: 1_234 },
    });
  });

  it("falls peakFight back to latest when the only snapshot is outside the 7d window", async () => {
    await seedMu(db, ["u1"]);
    const staleAt = new Date(NOW.getTime() - FIGHT_PEAK_WINDOW_MS - 24 * 60 * 60 * 1000);
    const pollId = await insertUserFightPoll(db, {
      recordedAt: staleAt,
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    await insertUserFightSnapshots(db, pollId, [
      { ...parsedFight("u1", "alice"), atk: 9_999, muId: "mu-1", recordedAt: staleAt },
    ]);
    const { app } = appFor(db);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: Array<{ fight: { atk: number } | null; peakFight: { atk: number } | null }>;
    };
    expect(body.members[0]).toMatchObject({
      fight: { atk: 9_999 },
      peakFight: { atk: 9_999 },
    });
  });

  it("live-fills a watched MU when no fight snapshots exist", async () => {
    await seedMu(db, ["u1"], true);
    const requestBatch = vi.fn(async () => [{ ok: true as const, data: rawFight("u1") }]);
    const { app } = appFor(db, requestBatch);

    const res = await app.request("http://localhost/mu-1/fight-desk");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asOf: string | null;
      members: Array<{ incomplete: boolean }>;
      meta: {
        watched: boolean;
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.asOf).toBe(NOW.toISOString());
    expect(body.members[0]?.incomplete).toBe(false);
    expect(body.meta).toEqual({
      watched: true,
      liveFilled: true,
      refreshFailedUserIds: [],
    });
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(1);
  });

  it("force-refreshes the roster, stores valid snapshots, and returns partial data", async () => {
    await seedMu(db, ["u1", "u2"]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: rawFight("u1") },
      { ok: true as const, data: { _id: "u2", username: "missing-fight-fields" } },
    ]);
    const { app } = appFor(db, requestBatch);

    const res = await app.request("http://localhost/mu-1/fight-desk/refresh", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asOf: string | null;
      members: Array<{ userId: string; incomplete: boolean; refreshFailed?: boolean }>;
      meta: {
        watched: boolean;
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.asOf).toBe(NOW.toISOString());
    expect(body.meta).toEqual({
      watched: false,
      liveFilled: true,
      refreshFailedUserIds: ["u2"],
    });
    expect(body.members).toMatchObject([
      { userId: "u1", incomplete: false },
      { userId: "u2", incomplete: true, refreshFailed: true },
    ]);
    expect(requestBatch).toHaveBeenCalledWith([
      { procedure: "user.getUserById", input: { userId: "u1" } },
      { procedure: "user.getUserById", input: { userId: "u2" } },
    ]);
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(1);
    expect(await db.select().from(schema.userFightPolls)).toHaveLength(1);
  });

  it("keeps an existing snapshot and marks the member when forced refresh fails", async () => {
    await seedMu(db, ["u1"]);
    const oldAt = new Date("2026-09-15T11:55:00.000Z");
    const pollId = await insertUserFightPoll(db, {
      recordedAt: oldAt,
      status: "success",
      userCount: 1,
      muCount: 1,
    });
    await insertUserFightSnapshots(db, pollId, [
      { ...parsedFight("u1", "alice"), muId: "mu-1", recordedAt: oldAt },
    ]);
    const requestBatch = vi.fn(async () => [
      { ok: true as const, data: { _id: "u1", username: "missing-fight-fields" } },
    ]);
    const { app } = appFor(db, requestBatch);

    const res = await app.request("http://localhost/mu-1/fight-desk/refresh", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: Array<{
        userId: string;
        incomplete: boolean;
        refreshFailed?: boolean;
        fight: unknown;
      }>;
      meta: {
        liveFilled: boolean;
        refreshFailedUserIds: string[];
      };
    };
    expect(body.meta.liveFilled).toBe(true);
    expect(body.meta.refreshFailedUserIds).toEqual(["u1"]);
    expect(body.members[0]).toMatchObject({
      userId: "u1",
      incomplete: false,
      refreshFailed: true,
      fight: {
        userId: "u1",
        atk: 1_234,
        precision: 0.82,
        pillStatus: "active",
      },
    });
    expect(await db.select().from(schema.userFightSnapshots)).toHaveLength(1);
  });

  it("returns battle strip with bonus and summed MU loot", async () => {
    const battleId = "b-crete";
    const fetchedAt = NOW;
    await seedMu(db, [], false, {
      countryId: "sweden",
      activeUpgradeLevels: { headquarters: 3 },
    });

    const creteBattle: ParsedBattle = {
      id: battleId,
      warId: "w-crete",
      type: "war",
      isActive: true,
      attacker: {
        countryId: "greece",
        regionId: "r-att",
        wonRoundsCount: 0,
        muOrders: ["mu-1"],
        countryOrders: ["sweden"],
        hitCount: null,
      },
      defender: {
        countryId: "turkey",
        regionId: "r-def",
        wonRoundsCount: 0,
        muOrders: [],
        countryOrders: [],
        hitCount: null,
      },
      roundsToWin: 8,
      rounds: [],
      roundsHistory: [],
      startedAtGame: null,
      currentRound: null,
      payload: null,
    };
    await upsertBattleFromParsed(db, creteBattle, { stickyMuIds: [], fetchedAt });
    await replaceBattleOrders(
      db,
      battleId,
      [
        { ownerType: "mu", ownerId: "mu-1", side: "attacker", priority: "low", payload: null },
        {
          ownerType: "country",
          ownerId: "sweden",
          side: "attacker",
          priority: "high",
          payload: null,
        },
      ],
      fetchedAt,
    );
    await db.insert(schema.regions).values({
      id: "r-def",
      name: "Crete",
      countryCode: "TR",
      enqueuedAt: fetchedAt,
      fetchedAt,
    });
    await db.insert(schema.battleBonusFacts).values({
      battleId,
      isRevolt: false,
      bunkerLevel: null,
      bunkerActive: null,
      militaryBaseLevel: null,
      militaryBaseActive: null,
      resistance: null,
      defenderSupplyLinked: null,
      attackerRegionId: "r-att",
      defenderRegionId: "r-def",
      fetchedAt,
    });

    const pollId = await insertBattlePoll(db, {
      recordedAt: fetchedAt,
      status: "success",
      battleCount: 1,
      lootSnapshotCount: 1,
      finalizedCount: 0,
    });
    await db.insert(schema.battleLootSnapshots).values({
      pollId,
      battleId,
      userId: "user-a",
      muId: "mu-1",
      totalDmg: 12_400_000,
      hits: null,
      totalMoneyFromBounty: null,
      totalMoneyFromContract: null,
      case1Count: null,
      case2Count: null,
      poolLoot: null,
      payload: null,
      recordedAt: fetchedAt,
    });

    const { app } = appFor(db);
    const res = await app.request("http://localhost/mu-1/fight-desk");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      battles: Array<{
        kind: string;
        regionName: string | null;
        muDamageToDate: number | null;
        bonus: { total: number; parts: Array<{ id: string; amount: number | null }> };
      }>;
    };

    expect(body.battles).toHaveLength(1);
    expect(body.battles[0]?.regionName).toBe("Crete");
    expect(body.battles[0]?.kind).toBe("both");
    expect(body.battles[0]?.muDamageToDate).toBe(12_400_000);

    const expectedBonus = computeBattleBonus({
      fightSide: "attacker",
      muCountryId: "sweden",
      attackerCountryId: "greece",
      defenderCountryId: "turkey",
      isRevolt: false,
      countryOrderPriority: "high",
      muOrderPriority: "low",
      hqLevel: 3,
      hqRunning: true,
      allianceWorldShare: null,
      defendingPactPartner: null,
      swornEnemy: null,
      bunkerLevel: null,
      bunkerActive: null,
      militaryBaseLevel: null,
      militaryBaseActive: false,
      resistance: null,
      defenderSupplyLinked: null,
      alliedFortHalf: true,
    });
    expect(body.battles[0]?.bonus.total).toBe(expectedBonus.total);
    expect(body.battles[0]?.bonus.parts).toEqual(expectedBonus.parts);
  });

  it("returns null muDamageToDate when the MU has no loot rows for the battle", async () => {
    const battleId = "b-no-loot";
    const fetchedAt = NOW;
    await seedMu(db, [], false, { countryId: "sweden" });
    await upsertBattleFromParsed(
      db,
      {
        id: battleId,
        warId: "w-empty",
        type: "war",
        isActive: true,
        attacker: {
          countryId: "x",
          regionId: "r-x",
          wonRoundsCount: 0,
          muOrders: [],
          countryOrders: ["sweden"],
          hitCount: null,
        },
        defender: {
          countryId: "y",
          regionId: "r-y",
          wonRoundsCount: 0,
          muOrders: [],
          countryOrders: [],
          hitCount: null,
        },
        roundsToWin: 8,
        rounds: [],
        roundsHistory: [],
        startedAtGame: null,
        currentRound: null,
        payload: null,
      },
      { stickyMuIds: [], fetchedAt },
    );
    await replaceBattleOrders(
      db,
      battleId,
      [
        {
          ownerType: "country",
          ownerId: "sweden",
          side: "attacker",
          priority: "high",
          payload: null,
        },
      ],
      fetchedAt,
    );

    const { app } = appFor(db);
    const res = await app.request("http://localhost/mu-1/fight-desk");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      battles: Array<{
        id: string;
        kind: string;
        muDamageToDate: number | null;
        bonus: { parts: Array<{ id: string; amount: number | null; status: string }> };
      }>;
    };
    expect(body.battles).toHaveLength(1);
    expect(body.battles[0]?.kind).toBe("country_order");
    expect(body.battles[0]?.muDamageToDate).toBeNull();
    const countryOrderPart = body.battles[0]?.bonus.parts.find((p) => p.id === "country_order");
    expect(countryOrderPart).toEqual({
      id: "country_order",
      label: "Country order",
      amount: 0.15,
      status: "applied",
    });
  });

  it("treats missing HQ upgrades as HQ off in battle bonus", async () => {
    const battleId = "b-hq-off";
    const fetchedAt = NOW;
    await seedMu(db, [], false, {
      countryId: "sweden",
      activeUpgradeLevels: null,
    });
    await upsertBattleFromParsed(
      db,
      {
        id: battleId,
        warId: "w-hq",
        type: "war",
        isActive: true,
        attacker: {
          countryId: "x",
          regionId: "r-x",
          wonRoundsCount: 0,
          muOrders: ["mu-1"],
          countryOrders: [],
          hitCount: null,
        },
        defender: {
          countryId: "y",
          regionId: "r-y",
          wonRoundsCount: 0,
          muOrders: [],
          countryOrders: [],
          hitCount: null,
        },
        roundsToWin: 8,
        rounds: [],
        roundsHistory: [],
        startedAtGame: null,
        currentRound: null,
        payload: null,
      },
      { stickyMuIds: [], fetchedAt },
    );
    await replaceBattleOrders(
      db,
      battleId,
      [{ ownerType: "mu", ownerId: "mu-1", side: "attacker", priority: "low", payload: null }],
      fetchedAt,
    );

    const { app } = appFor(db);
    const res = await app.request("http://localhost/mu-1/fight-desk");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      battles: Array<{ bonus: { parts: Array<{ id: string; amount: number | null; status: string }> } }>;
    };
    const hqPart = body.battles[0]?.bonus.parts.find((p) => p.id === "hq");
    expect(hqPart).toEqual({ id: "hq", label: "HQ", amount: 0, status: "off" });
  });
});
