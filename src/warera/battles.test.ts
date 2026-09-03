import { describe, expect, it, vi } from "vite-plus/test";
import {
  BATTLE_END_SETTLE_MS,
  fetchAllActiveBattles,
  fetchBattleById,
  fetchBattleLootSummary,
  parseBattleById,
  parseBattleListItem,
  parseBattleLootSummary,
  scoreboardFromBattle,
} from "./battles";

const battleListFixture = {
  _id: "b1",
  war: "w1",
  type: "war",
  isActive: true,
  roundsToWin: 2,
  rounds: ["r1"],
  roundsHistory: [],
  createdAt: "2026-09-03T10:00:00.000Z",
  extraKeep: "leftover",
  attacker: {
    country: "cA",
    region: "regA",
    wonRoundsCount: 0,
    muOrders: ["mu1"],
    damages: 0,
    hitCount: 10,
  },
  defender: {
    country: "cD",
    region: "regD",
    wonRoundsCount: 0,
    muOrders: [],
    damages: 0,
    hitCount: 8,
  },
  currentRound: {
    _id: "r1",
    battle: "b1",
    number: 1,
    isActive: true,
    createdAt: "2026-09-03T10:00:00.000Z",
    attacker: { country: "cA", damages: 1000, points: 5 },
    defender: { country: "cD", damages: 800, points: 3 },
    live: { ticksCount: 2, actualTickPoints: 1, nextTickAt: "2026-09-03T10:02:00.000Z" },
  },
};

const lootFixture = {
  totalDmg: 1234.5,
  hits: 12,
  totalMoneyFromBounty: 10,
  totalMoneyFromContract: 20,
  case1Count: 1,
  case2Count: 2,
  poolLoot: [{ code: "case1" }],
  leftover: true,
};

describe("parseBattleListItem", () => {
  it("parses getBattles-shaped item with embedded currentRound, muOrders, and hitCount", () => {
    const parsed = parseBattleListItem(battleListFixture);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      id: "b1",
      warId: "w1",
      type: "war",
      isActive: true,
      roundsToWin: 2,
      rounds: ["r1"],
      roundsHistory: [],
    });
    expect(parsed!.attacker).toMatchObject({
      countryId: "cA",
      regionId: "regA",
      wonRoundsCount: 0,
      muOrders: ["mu1"],
      hitCount: 10,
    });
    expect(parsed!.defender).toMatchObject({
      countryId: "cD",
      regionId: "regD",
      wonRoundsCount: 0,
      muOrders: [],
      hitCount: 8,
    });
    expect(parsed!.startedAtGame?.toISOString()).toBe("2026-09-03T10:00:00.000Z");
    expect(parsed!.currentRound).toMatchObject({
      id: "r1",
      number: 1,
      isActive: true,
      attackerDamages: 1000,
      defenderDamages: 800,
      attackerPoints: 5,
      defenderPoints: 3,
      live: { ticksCount: 2 },
    });
    expect(parsed!.currentRound!.live!.nextTickAt?.toISOString()).toBe("2026-09-03T10:02:00.000Z");
    expect(parsed!.currentRound!.createdAt?.toISOString()).toBe("2026-09-03T10:00:00.000Z");
    expect(parsed!.payload).toEqual({ extraKeep: "leftover" });
  });
});

describe("scoreboardFromBattle", () => {
  it("reads damages from currentRound, not side damages: 0", () => {
    const parsed = parseBattleListItem(battleListFixture);
    const scoreboard = scoreboardFromBattle(parsed!);
    expect(scoreboard).not.toBeNull();
    expect(scoreboard).toMatchObject({
      roundId: "r1",
      roundNumber: 1,
      roundIsActive: true,
      attackerPoints: 5,
      defenderPoints: 3,
      attackerDamages: 1000,
      defenderDamages: 800,
      attackerHitCount: 10,
      defenderHitCount: 8,
      ticksCount: 2,
    });
    expect(scoreboard!.nextTickAt?.toISOString()).toBe("2026-09-03T10:02:00.000Z");
    expect(scoreboard!.roundStartedAtGame?.toISOString()).toBe("2026-09-03T10:00:00.000Z");
  });

  it("returns null when currentRound is a string id only", () => {
    const parsed = parseBattleById({ ...battleListFixture, currentRound: "r1" });
    expect(parsed.currentRound).toBeNull();
    expect(scoreboardFromBattle(parsed)).toBeNull();
    expect(parsed.roundsHistory).toEqual([]);
    expect(parsed.attacker.muOrders).toEqual(["mu1"]);
  });
});

describe("parseBattleLootSummary", () => {
  it("maps loot summary fields", () => {
    const parsed = parseBattleLootSummary(lootFixture);
    expect(parsed).toMatchObject({
      totalDmg: 1234.5,
      hits: 12,
      totalMoneyFromBounty: 10,
      totalMoneyFromContract: 20,
      case1Count: 1,
      case2Count: 2,
      poolLoot: [{ code: "case1" }],
    });
    expect(parsed.payload).toEqual({ leftover: true });
  });
});

describe("fetchBattleLootSummary", () => {
  it("returns null when request throws isWareraNotFoundError", async () => {
    const request = vi.fn().mockRejectedValue(new Error("WarEra request failed: 404 NOT_FOUND"));
    const result = await fetchBattleLootSummary({ request }, "b1", "u1");
    expect(result).toBeNull();
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("battleLootSummary.getByBattleAndUser"),
    );
  });

  it("rethrows non-not-found errors", async () => {
    const request = vi.fn().mockRejectedValue(new Error("WarEra request failed: 502"));
    await expect(fetchBattleLootSummary({ request }, "b1", "u1")).rejects.toThrow("502");
  });
});

describe("fetchAllActiveBattles", () => {
  it("follows nextCursor across 2 pages and sets complete: true", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          data: { items: [battleListFixture], nextCursor: "page2" },
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: {
            items: [{ ...battleListFixture, _id: "b2" }],
            nextCursor: null,
          },
        },
      });
    const result = await fetchAllActiveBattles({ request });
    expect(result.complete).toBe(true);
    expect(result.pages).toBe(2);
    expect(result.battles.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(request.mock.calls[0]![0]))).toContain('"isActive":true');
    expect(decodeURIComponent(String(request.mock.calls[1]![0]))).toContain('"cursor":"page2"');
  });

  it("returns pages fetched so far with complete: false when a later page throws", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          data: { items: [battleListFixture], nextCursor: "page2" },
        },
      })
      .mockRejectedValueOnce(new Error("WarEra request failed: 502"));
    const result = await fetchAllActiveBattles({ request });
    expect(result.complete).toBe(false);
    expect(result.pages).toBe(1);
    expect(result.battles.map((b) => b.id)).toEqual(["b1"]);
  });

  it("fix3: payload not an object (string) -> malformed page, complete: false", async () => {
    const request = vi.fn().mockResolvedValueOnce({
      result: { data: "not-an-object" },
    });
    const result = await fetchAllActiveBattles({ request });
    expect(result.complete).toBe(false);
    expect(result.pages).toBe(1);
    expect(result.battles).toEqual([]);
  });

  it("fix3: object missing items array -> malformed page, complete: false", async () => {
    const request = vi.fn().mockResolvedValueOnce({
      result: { data: { nextCursor: null } },
    });
    const result = await fetchAllActiveBattles({ request });
    expect(result.complete).toBe(false);
    expect(result.pages).toBe(1);
    expect(result.battles).toEqual([]);
  });

  it("fix3: item that looks like a battle but has no id -> malformed, keeps valid items, complete: false", async () => {
    const request = vi.fn().mockResolvedValueOnce({
      result: {
        data: {
          items: [
            battleListFixture,
            { war: "w1", attacker: { muOrders: [] }, defender: { muOrders: [] } },
          ],
          nextCursor: null,
        },
      },
    });
    const result = await fetchAllActiveBattles({ request });
    expect(result.complete).toBe(false);
    expect(result.pages).toBe(1);
    expect(result.battles.map((b) => b.id)).toEqual(["b1"]);
  });

  it("fix3: empty items [] with no nextCursor on valid shape -> complete: true (true empty)", async () => {
    const request = vi.fn().mockResolvedValueOnce({
      result: { data: { items: [], nextCursor: null } },
    });
    const result = await fetchAllActiveBattles({ request });
    expect(result.complete).toBe(true);
    expect(result.pages).toBe(1);
    expect(result.battles).toEqual([]);
  });
});

describe("fetchBattleById", () => {
  it("calls battle.getById", async () => {
    const request = vi.fn().mockResolvedValue({ result: { data: battleListFixture } });
    const parsed = await fetchBattleById({ request }, "b1");
    expect(request).toHaveBeenCalledWith(expect.stringContaining("battle.getById"));
    expect(parsed.id).toBe("b1");
  });
});

describe("BATTLE_END_SETTLE_MS", () => {
  it("is 60 seconds", () => {
    expect(BATTLE_END_SETTLE_MS).toBe(60_000);
  });
});
