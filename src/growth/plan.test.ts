import { describe, expect, it } from "vite-plus/test";
import { planGrowthPath } from "./plan";
import type { GrowthFactory } from "./income";

const prices = { steel: 1, concrete: 1 };

function fac(id: string, aeLevel: number, goldPerAePerDay = 1): GrowthFactory {
  return { id, aeLevel, goldPerAePerDay };
}

describe("planGrowthPath", () => {
  it("is complete immediately when goal already met", () => {
    const result = planGrowthPath({
      factories: [fac("a", 7), fac("b", 7)],
      goalAe7Count: 2,
      mode: "optimal",
      wallet: { gold: 0, steel: 0, concrete: 0 },
      prices,
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(true);
    expect(result.steps).toHaveLength(0);
    expect(result.timeToGoalHours).toBe(0);
  });

  it("upgrades_only never buys beyond goal N", () => {
    const result = planGrowthPath({
      factories: [fac("a", 6)],
      goalAe7Count: 1,
      mode: "upgrades_only",
      wallet: { gold: 10_000, steel: 0, concrete: 0 },
      prices,
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(true);
    expect(result.steps.every((s) => s.action === "upgrade")).toBe(true);
    expect(result.finalFactories.length).toBe(1);
  });

  it("optimal may buy an extra company when helpful", () => {
    // High new-factory income + huge cash: buying can appear in the path toward 1×AE7 from empty-ish start.
    const result = planGrowthPath({
      factories: [fac("a", 1, 0.01)],
      goalAe7Count: 1,
      mode: "optimal",
      wallet: { gold: 50_000, steel: 0, concrete: 0 },
      prices: { steel: 1, concrete: 1 },
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 5,
    });
    expect(result.complete).toBe(true);
    // Not asserting a buy is mandatory for all inputs — assert planner returns a finite plan
    // and never exceeds 12 companies.
    expect(result.finalFactories.length).toBeLessThanOrEqual(12);
    expect(result.finalFactories.filter((f) => f.aeLevel === 7).length).toBeGreaterThanOrEqual(1);
  });

  it("marks stuck when no income and cannot afford", () => {
    const result = planGrowthPath({
      factories: [fac("a", 1, 0)],
      goalAe7Count: 1,
      mode: "upgrades_only",
      wallet: { gold: 0, steel: 0, concrete: 0 },
      prices,
      extraGoldPerDay: 0,
      newFactoryGoldPerAePerDay: 1,
    });
    expect(result.complete).toBe(false);
    expect(result.stuck).toBe(true);
  });
});
