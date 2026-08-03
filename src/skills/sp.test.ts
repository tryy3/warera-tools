import { describe, expect, it } from "vite-plus/test";
import {
  MAX_ECO_SKILL_LEVEL,
  maxAffordableLevel,
  spCostForLevel,
  totalSpForLevels,
  totalSpToReachLevel,
} from "./sp";

describe("spCostForLevel", () => {
  it("costs n SP for level n", () => {
    expect(spCostForLevel(1)).toBe(1);
    expect(spCostForLevel(2)).toBe(2);
    expect(spCostForLevel(4)).toBe(4);
  });
});

describe("totalSpToReachLevel", () => {
  it("sums 1..L", () => {
    expect(totalSpToReachLevel(0)).toBe(0);
    expect(totalSpToReachLevel(4)).toBe(10);
  });
});

describe("totalSpForLevels", () => {
  it("matches getUserLite sample 2+2+3+2 = 15", () => {
    expect(
      totalSpForLevels({
        energy: 2,
        entrepreneurship: 2,
        production: 3,
        lootChance: 2,
      }),
    ).toBe(15);
  });
});

describe("maxAffordableLevel", () => {
  it("with 3 SP from 0 can reach level 2 (costs 1+2)", () => {
    expect(maxAffordableLevel(0, 3)).toBe(2);
  });

  it("with 3 SP at level 7 cannot buy level 8 (costs 8)", () => {
    expect(maxAffordableLevel(7, 3)).toBe(7);
  });

  it("with 15 SP at level 5 can reach level 7 (costs 6+7)", () => {
    expect(maxAffordableLevel(5, 15)).toBe(7);
  });

  it("never exceeds MAX_ECO_SKILL_LEVEL", () => {
    expect(maxAffordableLevel(0, 1_000_000)).toBe(MAX_ECO_SKILL_LEVEL);
  });
});
