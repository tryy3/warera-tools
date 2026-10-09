import { describe, expect, it } from "vite-plus/test";
import { resolveBattleLadders, type BattleRankings, type ScopeRankings } from "./battle";
import type { RankedLootRow } from "./ladder";

const r = (rank: number, userId: string, value: number, itemCode: string | null = null) =>
  ({ rank, userId, value, itemCode }) satisfies RankedLootRow;

function scope(attacker: RankedLootRow[], defender: RankedLootRow[]): ScopeRankings {
  return {
    attacker: { rows: attacker, complete: true },
    defender: { rows: defender, complete: true },
  };
}

describe("resolveBattleLadders", () => {
  it("uses the side where the user is ranked and returns one ladder per scope", () => {
    const rankings: BattleRankings = {
      round: scope([r(1, "x", 90, "helmet3")], [r(1, "z", 50, "chest3"), r(2, "me", 20, "gun")]),
      battle: scope([r(1, "x", 900, "pants3")], [r(1, "z", 500, "boots4"), r(2, "me", 400, null)]),
    };
    const out = resolveBattleLadders(rankings, "me", 450);
    expect(out.mySide).toBe("defender");
    expect(out.ladders.map((l) => [l.scope, l.side])).toEqual([
      ["round", "defender"],
      ["battle", "defender"],
    ]);
    expect(out.ladders[0]).toMatchObject({ myDamage: 20, myRank: 2 });
    expect(out.ladders[0]!.targets[0]).toMatchObject({ rank: 1, damageNeeded: 31 });
    // battle scope uses the live summary damage, not the stale ranking value
    expect(out.ladders[1]).toMatchObject({ myDamage: 450 });
    expect(out.ladders[1]!.targets[0]).toMatchObject({ rank: 1, damageNeeded: 51 });
  });

  it("falls back to the battle ranking for the side when the round ranking lacks the user", () => {
    const rankings: BattleRankings = {
      round: scope([r(1, "x", 90, "helmet3")], [r(1, "z", 50, "chest3")]),
      battle: scope([r(1, "x", 900, "pants3"), r(2, "me", 5)], [r(1, "z", 500, "boots4")]),
    };
    const out = resolveBattleLadders(rankings, "me", 5);
    expect(out.mySide).toBe("attacker");
    expect(out.ladders.map((l) => l.side)).toEqual(["attacker", "attacker"]);
    expect(out.ladders[0]).toMatchObject({ myRank: null, myDamage: 0 });
    expect(out.ladders[0]!.targets[0]).toMatchObject({ rank: 1, damageNeeded: 91 });
  });

  it("lists both sides when the user is in no ranking", () => {
    const rankings: BattleRankings = {
      round: null,
      battle: scope([r(1, "x", 900, "pants3")], [r(1, "z", 500, "boots4")]),
    };
    const out = resolveBattleLadders(rankings, "me", 100);
    expect(out.mySide).toBeNull();
    expect(out.ladders.map((l) => [l.scope, l.side])).toEqual([
      ["battle", "attacker"],
      ["battle", "defender"],
    ]);
    expect(out.ladders[1]!.targets[0]).toMatchObject({ damageNeeded: 401 });
  });
});
