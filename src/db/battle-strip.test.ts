import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ParsedBattle } from "../warera/battles";
import type { ParsedMu } from "../warera/mu";
import { insertBattlePoll } from "./battle-stats";
import { listFightDeskBattles, listLatestMuDamageByBattle } from "./battle-strip";
import { upsertBattleFromParsed } from "./battles";
import type { Db } from "./client";
import { upsertMuCurrent } from "./mus";
import * as schema from "./schema";
import { createTestDb, truncateAllTables } from "./test/postgres";

function battleWithCountryOrder(id: string, countryOrders: string[]): ParsedBattle {
  return {
    id,
    warId: "w-strip",
    type: "war",
    isActive: true,
    attacker: {
      countryId: "att-c",
      regionId: "att-r",
      wonRoundsCount: 0,
      muOrders: [],
      countryOrders: [],
      hitCount: null,
    },
    defender: {
      countryId: "def-c",
      regionId: "def-r",
      wonRoundsCount: 0,
      muOrders: [],
      countryOrders,
      hitCount: null,
    },
    roundsToWin: 8,
    rounds: [],
    roundsHistory: [],
    startedAtGame: null,
    currentRound: null,
    payload: null,
  };
}

function unrelatedBattle(id: string): ParsedBattle {
  return {
    id,
    warId: "w-other",
    type: "war",
    isActive: true,
    attacker: {
      countryId: "x",
      regionId: "r-x",
      wonRoundsCount: 0,
      muOrders: ["mu-other"],
      countryOrders: ["chile"],
      hitCount: null,
    },
    defender: {
      countryId: "y",
      regionId: "r-y",
      wonRoundsCount: 0,
      muOrders: [],
      countryOrders: ["argentina"],
      hitCount: null,
    },
    roundsToWin: 8,
    rounds: [],
    roundsHistory: [],
    startedAtGame: null,
    currentRound: null,
    payload: null,
  };
}

function muSweden(): ParsedMu {
  return {
    id: "mu-1",
    name: "Sweden MU",
    avatarUrl: null,
    countryId: "sweden",
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
  };
}

describe("battle strip db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("sums latest loot per user for MU and lists country-order fight desk battles", async () => {
    const fetchedAt = new Date("2026-09-12T10:00:00.000Z");
    await upsertMuCurrent(db, muSweden(), fetchedAt);

    const relevantBattleId = "b-sweden-def";
    const emptyLootBattleId = "b-no-loot";
    await upsertBattleFromParsed(db, battleWithCountryOrder(relevantBattleId, ["sweden"]), {
      stickyMuIds: [],
      fetchedAt,
    });
    await upsertBattleFromParsed(db, unrelatedBattle("b-unrelated"), {
      stickyMuIds: [],
      fetchedAt,
    });
    await upsertBattleFromParsed(db, battleWithCountryOrder(emptyLootBattleId, ["sweden"]), {
      stickyMuIds: [],
      fetchedAt,
    });

    const pollId = await insertBattlePoll(db, {
      recordedAt: fetchedAt,
      status: "success",
      battleCount: 1,
      lootSnapshotCount: 3,
      finalizedCount: 0,
    });

    const t1 = new Date("2026-09-12T11:00:00.000Z");
    const t2 = new Date("2026-09-12T12:00:00.000Z");
    await db.insert(schema.battleLootSnapshots).values([
      {
        pollId,
        battleId: relevantBattleId,
        userId: "user-a",
        muId: "mu-1",
        totalDmg: 100,
        hits: null,
        totalMoneyFromBounty: null,
        totalMoneyFromContract: null,
        case1Count: null,
        case2Count: null,
        poolLoot: null,
        payload: null,
        recordedAt: t1,
      },
      {
        pollId,
        battleId: relevantBattleId,
        userId: "user-a",
        muId: "mu-1",
        totalDmg: 250,
        hits: null,
        totalMoneyFromBounty: null,
        totalMoneyFromContract: null,
        case1Count: null,
        case2Count: null,
        poolLoot: null,
        payload: null,
        recordedAt: t2,
      },
      {
        pollId,
        battleId: relevantBattleId,
        userId: "user-b",
        muId: "mu-1",
        totalDmg: 50,
        hits: null,
        totalMoneyFromBounty: null,
        totalMoneyFromContract: null,
        case1Count: null,
        case2Count: null,
        poolLoot: null,
        payload: null,
        recordedAt: t1,
      },
    ]);

    const damage = await listLatestMuDamageByBattle(db, "mu-1", [
      relevantBattleId,
      emptyLootBattleId,
    ]);
    expect(damage.get(relevantBattleId)).toBe(300);
    expect(damage.has(emptyLootBattleId)).toBe(false);

    const strip = await listFightDeskBattles(db, "mu-1");
    const ids = strip.map((row) => row.id).toSorted();
    expect(ids).toContain(relevantBattleId);
    expect(ids).toContain(emptyLootBattleId);
    expect(ids).not.toContain("b-unrelated");

    const row = strip.find((r) => r.id === relevantBattleId);
    expect(row?.defenderCountryOrders).toEqual(["sweden"]);
    expect(row?.isActive).toBe(true);
  });

  it("latest loot per user is scoped to this MU when another MU has newer snapshots", async () => {
    const fetchedAt = new Date("2026-09-12T10:00:00.000Z");
    const battleId = "b-mixed-mu";
    await upsertBattleFromParsed(db, battleWithCountryOrder(battleId, ["sweden"]), {
      stickyMuIds: [],
      fetchedAt,
    });

    const pollId = await insertBattlePoll(db, {
      recordedAt: fetchedAt,
      status: "success",
      battleCount: 1,
      lootSnapshotCount: 3,
      finalizedCount: 0,
    });

    const t1 = new Date("2026-09-12T11:00:00.000Z");
    const t2 = new Date("2026-09-12T12:00:00.000Z");
    const t3 = new Date("2026-09-12T13:00:00.000Z");
    await db.insert(schema.battleLootSnapshots).values([
      {
        pollId,
        battleId,
        userId: "user-a",
        muId: "mu-1",
        totalDmg: 250,
        hits: null,
        totalMoneyFromBounty: null,
        totalMoneyFromContract: null,
        case1Count: null,
        case2Count: null,
        poolLoot: null,
        payload: null,
        recordedAt: t2,
      },
      {
        pollId,
        battleId,
        userId: "user-a",
        muId: "mu-other",
        totalDmg: 999,
        hits: null,
        totalMoneyFromBounty: null,
        totalMoneyFromContract: null,
        case1Count: null,
        case2Count: null,
        poolLoot: null,
        payload: null,
        recordedAt: t3,
      },
      {
        pollId,
        battleId,
        userId: "user-b",
        muId: "mu-1",
        totalDmg: 50,
        hits: null,
        totalMoneyFromBounty: null,
        totalMoneyFromContract: null,
        case1Count: null,
        case2Count: null,
        poolLoot: null,
        payload: null,
        recordedAt: t1,
      },
    ]);

    const damage = await listLatestMuDamageByBattle(db, "mu-1", [battleId]);
    expect(damage.get(battleId)).toBe(300);
  });
});
