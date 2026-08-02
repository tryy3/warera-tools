import { describe, expect, it } from "vite-plus/test";
import { dailyGoldFromFactories, goldPerAePerDayFromProfit, hourlyGoldFromFactories } from "./income";

describe("goldPerAePerDayFromProfit", () => {
  it("equals AE1 daily value", () => {
    // 1 * (1+0.5) * 24 * 0.1 = 3.6
    expect(goldPerAePerDayFromProfit(0.1, 0.5)).toBeCloseTo(3.6);
  });
});

describe("dailyGoldFromFactories", () => {
  it("sums ae * gPerAe + extra", () => {
    const factories = [
      { id: "a", aeLevel: 2, goldPerAePerDay: 3 },
      { id: "b", aeLevel: 1, goldPerAePerDay: 4 },
    ];
    expect(dailyGoldFromFactories(factories, 10)).toBeCloseTo(2 * 3 + 1 * 4 + 10);
  });
});

describe("hourlyGoldFromFactories", () => {
  it("divides daily by 24", () => {
    expect(hourlyGoldFromFactories([{ id: "a", aeLevel: 1, goldPerAePerDay: 24 }], 0)).toBeCloseTo(1);
  });
});
