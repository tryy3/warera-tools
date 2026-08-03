import { describe, expect, it } from "vite-plus/test";
import type { GrowthFactory } from "./income";
import { planGrowthPath } from "./plan";

const prices = { steel: 1, concrete: 1 };
const zeroSideIncome = { workGPerDay: 0, selfWorkGPerDay: 0, extraGoldPerDay: 0 };

function fac(id: string, aeLevel: number, goldPerAePerDay = 1): GrowthFactory {
  return { id, aeLevel, goldPerAePerDay };
}

describe("planGrowthPath heuristics", () => {
  it("is complete immediately when goal already met", () => {
    const result = planGrowthPath({
      factories: [fac("a", 7), fac("b", 7)],
      goalAe7Count: 2,
      mode: "cheapest",
      wallet: { gold: 0, steel: 0, concrete: 0 },
      prices,
      sideIncome: zeroSideIncome,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(true);
    expect(result.steps).toHaveLength(0);
    expect(result.timeToGoalHours).toBe(0);
  });

  it("upgrade_first never buys while any company is below AE7", () => {
    const result = planGrowthPath({
      factories: [fac("a", 6), fac("b", 1)],
      goalAe7Count: 1,
      mode: "upgrade_first",
      wallet: { gold: 10_000, steel: 0, concrete: 0 },
      prices,
      sideIncome: zeroSideIncome,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(true);
    expect(result.steps.every((s) => s.action === "upgrade")).toBe(true);
    expect(result.finalFactories.length).toBe(2);
  });

  it("upgrade_first buys only up to goal N after all are AE7", () => {
    const result = planGrowthPath({
      factories: [fac("a", 7)],
      goalAe7Count: 2,
      mode: "upgrade_first",
      wallet: { gold: 50_000, steel: 0, concrete: 0 },
      prices,
      sideIncome: zeroSideIncome,
      newFactoryGoldPerAePerDay: 2,
    });
    expect(result.complete).toBe(true);
    expect(result.finalFactories.length).toBe(2);
    expect(result.steps.some((s) => s.action === "buy")).toBe(true);
    expect(result.finalFactories.length).toBeLessThanOrEqual(2);
  });

  it("cheapest prefers lower gold-cost actions", () => {
    // L1→L2 costs 20 steel (=20G); new company #2 costs 100 concrete (=100G).
    const result = planGrowthPath({
      factories: [fac("a", 1, 1)],
      goalAe7Count: 1,
      mode: "cheapest",
      wallet: { gold: 10_000, steel: 0, concrete: 0 },
      prices,
      sideIncome: zeroSideIncome,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(true);
    expect(result.steps[0]?.action).toBe("upgrade");
  });

  it("income_roi can buy when a new company is the better G/day per gold", () => {
    // Expensive upgrade path vs cheap buy with huge new income (goal allows 2 slots).
    const result = planGrowthPath({
      factories: [fac("a", 6, 0.1)],
      goalAe7Count: 2,
      mode: "income_roi",
      wallet: { gold: 50_000, steel: 0, concrete: 0 },
      prices: { steel: 100, concrete: 1 },
      sideIncome: zeroSideIncome,
      newFactoryGoldPerAePerDay: 50,
    });
    expect(result.complete).toBe(true);
    // Buying a high-income AE1 can beat upgrading AE6→7 at 640*100G steel.
    expect(result.steps.some((s) => s.action === "buy")).toBe(true);
    expect(result.finalFactories.length).toBeLessThanOrEqual(2);
  });

  it("cheapest and income_roi never buy past goal N", () => {
    for (const mode of ["cheapest", "income_roi"] as const) {
      const result = planGrowthPath({
        factories: [fac("a", 1, 2)],
        goalAe7Count: 3,
        mode,
        wallet: { gold: 100_000, steel: 0, concrete: 0 },
        prices,
        sideIncome: zeroSideIncome,
        newFactoryGoldPerAePerDay: 2,
      });
      expect(result.complete).toBe(true);
      expect(result.finalFactories.length).toBeLessThanOrEqual(3);
      expect(result.finalFactories.filter((f) => f.aeLevel === 7).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("marks stuck when no income and cannot afford", () => {
    const result = planGrowthPath({
      factories: [fac("a", 1, 0)],
      goalAe7Count: 1,
      mode: "cheapest",
      wallet: { gold: 0, steel: 0, concrete: 0 },
      prices,
      sideIncome: zeroSideIncome,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(false);
    expect(result.stuck).toBe(true);
  });

  it("work income reduces time-to-goal vs zero side income", () => {
    const shared = {
      factories: [fac("a", 1, 1)],
      goalAe7Count: 1,
      mode: "cheapest" as const,
      wallet: { gold: 0, steel: 0, concrete: 0 },
      prices,
      newFactoryGoldPerAePerDay: 1,
    };
    const withoutWork = planGrowthPath({ ...shared, sideIncome: zeroSideIncome });
    const withWork = planGrowthPath({
      ...shared,
      sideIncome: { workGPerDay: 100, selfWorkGPerDay: 0, extraGoldPerDay: 0 },
    });
    expect(withWork.complete).toBe(true);
    expect(withoutWork.complete).toBe(true);
    expect(withWork.timeToGoalHours).toBeLessThan(withoutWork.timeToGoalHours!);
  });
});
