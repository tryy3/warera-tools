import { describe, expect, it } from "vite-plus/test";
import { spCostForLevel, totalSpForLevels, totalSpToReachLevel } from "./sp";

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
