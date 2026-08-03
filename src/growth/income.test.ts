import { describe, expect, it } from "vite-plus/test";
import {
  dailyGoldFromFactories,
  goldPerAePerDayFromProfit,
  hourlyGoldFromFactories,
  sideIncomeTotal,
} from "./income";

describe("goldPerAePerDayFromProfit", () => {
  it("equals AE1 daily value", () => {
    // 1 * (1+0.5) * 24 * 0.1 = 3.6
    expect(goldPerAePerDayFromProfit(0.1, 0.5)).toBeCloseTo(3.6);
  });
});

describe("sideIncomeTotal", () => {
  it("sums work, selfWork, and extra", () => {
    expect(
      sideIncomeTotal({ workGPerDay: 10, selfWorkGPerDay: 5, extraGoldPerDay: 1 }),
    ).toBeCloseTo(16);
  });
});

describe("dailyGoldFromFactories", () => {
  it("sums ae * gPerAe + extra", () => {
    const factories = [
      { id: "a", aeLevel: 2, goldPerAePerDay: 3 },
      { id: "b", aeLevel: 1, goldPerAePerDay: 4 },
    ];
    expect(
      dailyGoldFromFactories(factories, {
        workGPerDay: 0,
        selfWorkGPerDay: 0,
        extraGoldPerDay: 10,
      }),
    ).toBeCloseTo(2 * 3 + 1 * 4 + 10);
  });

  it("adds work + selfWork + extra on top of AE", () => {
    const factories = [{ id: "a", aeLevel: 2, goldPerAePerDay: 3 }];
    expect(
      dailyGoldFromFactories(factories, {
        workGPerDay: 10,
        selfWorkGPerDay: 5,
        extraGoldPerDay: 1,
      }),
    ).toBeCloseTo(2 * 3 + 10 + 5 + 1);
  });
});

describe("hourlyGoldFromFactories", () => {
  it("divides daily by 24", () => {
    expect(
      hourlyGoldFromFactories([{ id: "a", aeLevel: 1, goldPerAePerDay: 24 }], {
        workGPerDay: 0,
        selfWorkGPerDay: 0,
        extraGoldPerDay: 0,
      }),
    ).toBeCloseTo(1);
  });
});
