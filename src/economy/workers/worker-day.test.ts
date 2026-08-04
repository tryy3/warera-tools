import { describe, expect, it } from "vite-plus/test";
import { MAX_FIDELITY_PCT, workerDay, workerDayAtFidelity } from "./worker-day";
import { skillValueFromLevel } from "../../skills/values";
import { dailyActionsFromBar } from "../../skills/income";

describe("workerDay", () => {
  it("applies production bonus and fidelity additively to output PP only", () => {
    const energyLevel = 5;
    const productionLevel = 5;
    const actions = dailyActionsFromBar(skillValueFromLevel("energy", energyLevel));
    const ppPerAction = skillValueFromLevel("production", productionLevel);
    const base = actions * ppPerAction;
    const r = workerDay({
      energyLevel,
      productionLevel,
      productionBonus: 0.605,
      fidelityPct: 1,
      grossWagePerPp: 0.134,
      profitPerPp: 0.083,
    });
    expect(r.basePpPerDay).toBeCloseTo(base, 6);
    expect(r.effectivePpPerDay).toBeCloseTo(base * (1 + 0.605 + 0.01), 4);
    // Owner pays unboosted PP; bonuses stay with the company.
    expect(r.ownerCostPerDay).toBeCloseTo(base * 0.134, 4);
    expect(r.revenuePerDay).toBeCloseTo(r.effectivePpPerDay * 0.083, 4);
    expect(r.contributionPerDay).toBeCloseTo(r.revenuePerDay - r.ownerCostPerDay, 4);
  });

  it("improves contribution at max fidelity even when wage exceeds bare profit/PP", () => {
    const baseInput = {
      energyLevel: 5,
      productionLevel: 5,
      productionBonus: 0.605,
      grossWagePerPp: 0.134,
      profitPerPp: 0.083,
    };
    const now = workerDayAtFidelity(baseInput, 1);
    const max = workerDayAtFidelity(baseInput, MAX_FIDELITY_PCT);
    expect(max.ownerCostPerDay).toBeCloseTo(now.ownerCostPerDay, 6);
    expect(max.effectivePpPerDay).toBeGreaterThan(now.effectivePpPerDay);
    expect(max.contributionPerDay).toBeGreaterThan(now.contributionPerDay);
  });
});
