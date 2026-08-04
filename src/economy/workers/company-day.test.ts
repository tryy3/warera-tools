import { describe, expect, it } from "vite-plus/test";
import { explainAeDaily } from "../profit";
import { getRecipe } from "../recipes";
import { companyDay } from "./company-day";
import { MAX_FIDELITY_PCT } from "./worker-day";

describe("companyDay", () => {
  it("AE-only company matches explainAeDaily and has zero worker lines", () => {
    const aeLevel = 5;
    const productionBonus = 0.505;
    const profitPerPp = 0.134;
    const ae = explainAeDaily(aeLevel, productionBonus, profitPerPp);

    const r = companyDay({
      aeLevel,
      productionBonus,
      profitPerPp,
      itemCode: "grain",
      inputCostPerUnit: 0,
      entrepreneurshipLevel: 10,
      productionSkillLevel: 10,
      includeSelfWork: false,
      workers: [],
    });

    expect(r.aeDailyPp).toBeCloseTo(ae.dailyPp, 6);
    expect(r.aeDailyValue).toBeCloseTo(ae.dailyValue, 6);
    expect(r.selfWorkDailyPp).toBe(0);
    expect(r.selfWorkDailyValue).toBe(0);
    expect(r.workers).toEqual([]);
    expect(r.workerWageCostPerDay).toBe(0);
    expect(r.workerRevenuePerDay).toBe(0);
    expect(r.totalPpPerDay).toBeCloseTo(ae.dailyPp, 6);
    expect(r.netPerDay).toBeCloseTo(ae.dailyValue, 6);
    expect(r.netPerDayAtMaxWorkerFidelity).toBeCloseTo(ae.dailyValue, 6);
    expect(r.maxGrossWagePerPp).toBe(profitPerPp);
  });

  it("one worker is loss-making at 0% fidelity and profitable at 10% when wage is between break-even margins", () => {
    // With wage above profit/PP, contribution is negative at any fidelity (scales both sides).
    // Cover the brief's loss-making case, then a wage-below-profit case where 10% is more profitable.
    const loss = companyDay({
      aeLevel: 0,
      productionBonus: 0.5,
      profitPerPp: 0.1,
      itemCode: null,
      inputCostPerUnit: 0,
      entrepreneurshipLevel: 0,
      productionSkillLevel: 5,
      includeSelfWork: false,
      workers: [
        {
          id: "w-loss",
          energyLevel: 5,
          productionLevel: 5,
          fidelityPct: 0,
          grossWagePerPp: 0.15,
        },
      ],
    });
    expect(loss.workers).toHaveLength(1);
    expect(loss.workers[0]!.current.contributionPerDay).toBeLessThan(0);
    expect(loss.netPerDay).toBeLessThan(0);

    const win = companyDay({
      aeLevel: 0,
      productionBonus: 0.5,
      profitPerPp: 0.2,
      itemCode: null,
      inputCostPerUnit: 0,
      entrepreneurshipLevel: 0,
      productionSkillLevel: 5,
      includeSelfWork: false,
      workers: [
        {
          id: "w-win",
          energyLevel: 5,
          productionLevel: 5,
          fidelityPct: 0,
          grossWagePerPp: 0.15,
        },
      ],
    });
    expect(win.workers[0]!.current.contributionPerDay).toBeGreaterThan(0);
    expect(win.workers[0]!.atMaxFidelity.contributionPerDay).toBeGreaterThan(
      win.workers[0]!.current.contributionPerDay,
    );
    expect(win.workers[0]!.atMaxFidelity.effectivePpPerDay).toBeCloseTo(
      win.workers[0]!.current.effectivePpPerDay * (1 + MAX_FIDELITY_PCT / 100),
      6,
    );
    expect(win.netPerDayAtMaxWorkerFidelity).toBeGreaterThan(win.netPerDay);
  });

  it("unitsProduced is null when itemCode has no recipe", () => {
    const base = {
      aeLevel: 3,
      productionBonus: 0.2,
      profitPerPp: 0.1,
      inputCostPerUnit: 1,
      entrepreneurshipLevel: 0,
      productionSkillLevel: 0,
      includeSelfWork: false,
      workers: [] as const,
    };

    expect(companyDay({ ...base, itemCode: null }).unitsProduced).toBeNull();
    expect(getRecipe("not-a-real-item")).toBeUndefined();
    expect(companyDay({ ...base, itemCode: "not-a-real-item" }).unitsProduced).toBeNull();
  });

  it("inputCostPerDay equals unitsProduced × inputCostPerUnit", () => {
    const inputCostPerUnit = 0.8;
    const r = companyDay({
      aeLevel: 6,
      productionBonus: 0.35,
      profitPerPp: 0.082,
      itemCode: "steel",
      inputCostPerUnit,
      entrepreneurshipLevel: 0,
      productionSkillLevel: 0,
      includeSelfWork: false,
      workers: [],
    });
    const recipe = getRecipe("steel");
    expect(recipe).toBeDefined();
    expect(r.unitsProduced).not.toBeNull();
    expect(r.unitsProduced).toBeCloseTo(r.totalPpPerDay / recipe!.consumedPp, 6);
    expect(r.inputCostPerDay).toBeCloseTo(r.unitsProduced! * inputCostPerUnit, 6);
  });
});
