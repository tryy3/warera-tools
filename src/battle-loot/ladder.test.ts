import { describe, expect, it } from "vite-plus/test";
import { buildLootLadder, tallyLoot, type RankedLootRow } from "./ladder";

function row(rank: number, userId: string, value: number, itemCode: string | null): RankedLootRow {
  return { rank, userId, value, itemCode };
}

// Defender-style round: 5 slots carry items, the rest are plain ranks.
const rows: RankedLootRow[] = [
  row(1, "a", 1000, "boots3"),
  row(2, "b", 800, "chest3"),
  row(3, "c", 500, "chest2"),
  row(4, "d", 300, "gun"),
  row(5, "e", 100, "helmet2"),
  row(6, "me", 50, null),
  row(7, "f", 10, null),
];

describe("buildLootLadder", () => {
  it("treats an unranked user as below every slot", () => {
    const ladder = buildLootLadder(rows, "ghost", 0);
    expect(ladder.myRank).toBeNull();
    expect(ladder.current).toBeNull();
    expect(ladder.targets.map((t) => [t.rank, t.damageNeeded])).toEqual([
      [5, 101],
      [4, 301],
      [3, 501],
      [2, 801],
      [1, 1001],
    ]);
    expect(ladder.nextTier?.rank).toBe(5);
    expect(ladder.otherTypes).toEqual([]);
  });

  it("has no targets for the top slot holder", () => {
    const ladder = buildLootLadder(rows, "a", 1000);
    expect(ladder.myRank).toBe(1);
    expect(ladder.current).toMatchObject({ rank: 1, tier: "blue", kind: "boots" });
    expect(ladder.targets).toEqual([]);
    expect(ladder.nextTier).toBeNull();
    expect(ladder.otherTypes).toEqual([]);
  });

  it("lists only slots above a mid-ladder holder, cheapest first", () => {
    const ladder = buildLootLadder(rows, "d", 300);
    expect(ladder.current).toMatchObject({ rank: 4, tier: "green", kind: "weapon", code: "gun" });
    expect(ladder.targets.map((t) => [t.rank, t.damageNeeded])).toEqual([
      [3, 201],
      [2, 501],
      [1, 701],
    ]);
  });

  it("needs one more than a tied holder", () => {
    const tied = [row(1, "a", 100, "helmet3"), row(2, "me", 100, "helmet2")];
    const ladder = buildLootLadder(tied, "me", 100);
    expect(ladder.targets.map((t) => t.damageNeeded)).toEqual([1]);
  });

  it("clamps to zero when live damage already passes the stale holder value", () => {
    const stale = [row(1, "a", 100, "helmet3"), row(2, "me", 90, "helmet2")];
    const ladder = buildLootLadder(stale, "me", 400);
    expect(ladder.targets[0]?.damageNeeded).toBe(0);
  });

  it("ignores ranks without an item as targets but still ranks the user below them", () => {
    const ladder = buildLootLadder(rows, "me", 50);
    expect(ladder.myRank).toBe(6);
    expect(ladder.current).toBeNull();
    expect(ladder.targets.map((t) => t.rank)).toEqual([5, 4, 3, 2, 1]);
    expect(ladder.targets.every((t) => t.rank < 6)).toBe(true);
  });

  it("picks the cheapest strictly higher tier as nextTier", () => {
    // me holds rank 5 helmet2 (green). Slots above: boots3 blue, chest3 blue, chest2 green, gun green.
    const ladder = buildLootLadder(rows, "e", 100);
    expect(ladder.current).toMatchObject({ rank: 5, tier: "green", kind: "helmet" });
    expect(ladder.nextTier).toMatchObject({ rank: 2, tier: "blue", damageNeeded: 701 });
  });

  it("lists same-or-better tier slots of a different type as otherTypes", () => {
    const set: RankedLootRow[] = [
      row(1, "a", 900, "gloves4"),
      row(2, "b", 600, "pants3"),
      row(3, "c", 400, "pants1"),
      row(4, "d", 300, "helmet3"),
      row(5, "me", 100, "pants3"),
    ];
    const ladder = buildLootLadder(set, "me", 100);
    expect(ladder.current).toMatchObject({ tier: "blue", kind: "pants" });
    expect(ladder.otherTypes.map((t) => [t.rank, t.kind, t.tier])).toEqual([
      [4, "helmet", "blue"],
      [1, "gloves", "purple"],
    ]);
  });

  it("maps weapon codes through the tier overrides", () => {
    const ladder = buildLootLadder([row(1, "a", 50, "tank"), row(2, "me", 10, "knife")], "me", 10);
    expect(ladder.current).toMatchObject({ tier: "gray", kind: "weapon" });
    expect(ladder.nextTier).toMatchObject({ tier: "yellow", kind: "weapon", damageNeeded: 41 });
  });

  it("drops slots whose item code has no known tier", () => {
    const ladder = buildLootLadder([row(1, "a", 50, "mystery"), row(2, "me", 10, null)], "me", 10);
    expect(ladder.targets).toEqual([]);
  });
});

describe("tallyLoot", () => {
  it("counts held items by tier and kind", () => {
    const tally = tallyLoot([
      { tier: "blue", kind: "chest", code: "chest3" },
      { tier: "blue", kind: "chest", code: "chest3" },
      { tier: "green", kind: "weapon", code: "gun" },
    ]);
    expect(tally).toEqual([
      { tier: "blue", kind: "chest", code: "chest3", count: 2 },
      { tier: "green", kind: "weapon", code: "gun", count: 1 },
    ]);
  });
});
