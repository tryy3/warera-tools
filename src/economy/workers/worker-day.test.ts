import { describe, expect, it } from "vite-plus/test";
import { MAX_FIDELITY_PCT, workerDay, workerDayAtFidelity } from "./worker-day";
import { skillValueFromLevel } from "../../skills/values";
import { dailyActionsFromBar } from "../../skills/income";

describe("workerDay", () => {
  it("scales PP by bonus and fidelity", () => {
    const energyLevel = 5;
    const productionLevel = 5;
    const actions = dailyActionsFromBar(skillValueFromLevel("energy", energyLevel));
    const ppPerAction = skillValueFromLevel("production", productionLevel);
    const base = actions * ppPerAction;
    const r = workerDay({
      energyLevel,
      productionLevel,
      productionBonus: 0.605,
      fidelityPct: 0,
      grossWagePerPp: 0.135,
      profitPerPp: 0.134,
    });
    expect(r.effectivePpPerDay).toBeCloseTo(base * 1.605, 4);
    expect(r.contributionPerDay).toBeCloseTo(
      r.effectivePpPerDay * (0.134 - 0.135),
      4,
    );
  });

  it("projects higher contribution at max fidelity when wage below profit/PP", () => {
    const baseInput = {
      energyLevel: 5,
      productionLevel: 5,
      productionBonus: 0.5,
      grossWagePerPp: 0.1,
      profitPerPp: 0.2,
    };
    const now = workerDayAtFidelity(baseInput, 0);
    const max = workerDayAtFidelity(baseInput, MAX_FIDELITY_PCT);
    expect(max.contributionPerDay).toBeGreaterThan(now.contributionPerDay);
    expect(max.effectivePpPerDay / now.effectivePpPerDay).toBeCloseTo(1.1, 6);
  });
});
