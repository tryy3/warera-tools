import { describe, expect, it } from "vite-plus/test";
import {
  aeDailyValue,
  calculateProfitPerPp,
  enrichMarketOpportunities,
  explainAeDaily,
  listMarketOpportunities,
  OPPORTUNITY_REFERENCE_AE,
  paybackDays,
  transferCostGold,
  type ProfitPpBreakdown,
} from "./profit";

describe("calculateProfitPerPp", () => {
  it("nets input costs for steel", () => {
    const prices = { steel: 1.62, iron: 0.08 };
    const result = calculateProfitPerPp("steel", prices);
    expect(result).not.toBeNull();
    expect(result!.inputCost).toBeCloseTo(0.8);
    expect(result!.unitProfit).toBeCloseTo(0.82);
    expect(result!.profitPerPp).toBeCloseTo(0.082);
  });

  it("raw lead is just price / 1 PP", () => {
    const result = calculateProfitPerPp("lead", { lead: 0.086 });
    expect(result!.profitPerPp).toBeCloseTo(0.086);
  });

  it("embeds rounded numbers in profit formula", () => {
    const result = calculateProfitPerPp("lead", { lead: 0.08560533885010638 });
    expect(result!.formula).toBe("(0.0856 G − 0 G raw) / 1 PP");
  });

  it("rounds marketPrice in missing-inputs formula", () => {
    const result = calculateProfitPerPp("steel", { steel: 1.623465789 });
    expect(result!.missingInputs).toContain("iron");
    expect(result!.formula).toBe("(1.6235 G − [10 iron × ? G]) / 10 PP");
    expect(result!.formula).not.toContain("1.623465789");
  });
});

describe("listMarketOpportunities", () => {
  it("ranks by profit per PP", () => {
    const list = listMarketOpportunities({
      lead: 0.08,
      iron: 0.08,
      steel: 1.62,
      grain: 0.07,
      limestone: 0.08,
      petroleum: 0.08,
      coca: 0.08,
      wood: 0.09,
      livestock: 1.4,
      fish: 3.3,
      concrete: 1.6,
      oil: 0.17,
      bread: 1.8,
      steak: 3.5,
      cookedFish: 7.5,
      lightAmmo: 0.17,
      ammo: 0.65,
      heavyAmmo: 2.4,
      cocain: 32,
    });
    expect(list[0]!.profitPerPp).toBeGreaterThanOrEqual(list.at(-1)!.profitPerPp!);
  });
});

describe("aeDailyValue / transfer", () => {
  it("computes AE daily value", () => {
    expect(aeDailyValue(6, 0.5, 0.1)).toBeCloseTo(6 * 1.5 * 24 * 0.1);
  });

  it("includes production bonus in explainAeDaily", () => {
    const explained = explainAeDaily(6, 0.505, 0.0856);
    expect(explained.dailyPp).toBeCloseTo(6 * 1.505 * 24);
    expect(explained.dailyValue).toBeCloseTo(6 * 1.505 * 24 * 0.0856);
    expect(explained.formula).toContain("50.5%");
  });

  it("embeds rounded numbers in AE formula", () => {
    const explained = explainAeDaily(6, 0.505, 0.08560533885010638);
    expect(explained.formula).toContain("0.0856");
    expect(explained.formula).not.toContain("0.08560533885010638");
    // numeric outputs remain full precision
    expect(explained.dailyValue).toBeCloseTo(6 * 1.505 * 24 * 0.08560533885010638);
  });

  it("transfer cost uses concrete price", () => {
    expect(transferCostGold(1.6, { retask: true, relocate: true })).toMatchObject({
      concreteUnits: 10,
      gold: 16,
    });
  });

  it("payback days", () => {
    expect(paybackDays(16, 2)).toBeCloseTo(8);
    expect(paybackDays(16, 0)).toBeNull();
  });
});

describe("enrichMarketOpportunities", () => {
  const steak: ProfitPpBreakdown = {
    itemCode: "steak",
    marketPrice: 3.7432,
    inputCost: 1.545,
    unitProfit: 2.1982,
    consumedPp: 20,
    profitPerPp: 0.1099,
    missingInputs: [],
    formula: "(3.7432 G − 1.545 G raw) / 20 PP",
  };
  const concrete: ProfitPpBreakdown = {
    itemCode: "concrete",
    marketPrice: 1.6374,
    inputCost: 0.7933,
    unitProfit: 0.8441,
    consumedPp: 10,
    profitPerPp: 0.0844,
    missingInputs: [],
    formula: "(1.6374 G − 0.7933 G raw) / 10 PP",
  };

  it("attaches AE6 rough daily from best-region bonus and keeps G/PP order", () => {
    const regions = new Map([
      ["steak", { regionId: "r1", regionName: "Somewhere", bonus: 0.2 }],
      ["concrete", { regionId: "r2", regionName: "Tehran", bonus: 0.61 }],
    ]);
    const enriched = enrichMarketOpportunities([steak, concrete], regions);
    expect(enriched.map((o) => o.itemCode)).toEqual(["steak", "concrete"]);
    expect(enriched[0]!.referenceAeLevel).toBe(OPPORTUNITY_REFERENCE_AE);
    expect(enriched[0]!.bestBonus).toBe(0.2);
    expect(enriched[0]!.roughDailyValue).toBe(
      explainAeDaily(OPPORTUNITY_REFERENCE_AE, 0.2, 0.1099).dailyValue,
    );
    expect(enriched[1]!.bestBonus).toBe(0.61);
    expect(enriched[1]!.bestRegionName).toBe("Tehran");
    expect(enriched[1]!.roughDailyValue).toBe(
      explainAeDaily(OPPORTUNITY_REFERENCE_AE, 0.61, 0.0844).dailyValue,
    );
    // Stronger bonus can yield higher daily despite lower G/PP
    expect(enriched[1]!.roughDailyValue!).toBeGreaterThan(enriched[0]!.roughDailyValue!);
  });

  it("leaves bonus/daily null when region or bonus is unknown", () => {
    const regions = new Map([
      ["concrete", { regionId: "r2", regionName: "Tehran", bonus: null }],
    ]);
    const enriched = enrichMarketOpportunities([steak, concrete], regions);
    expect(enriched[0]).toMatchObject({
      bestBonus: null,
      bestRegionId: null,
      bestRegionName: null,
      roughDailyValue: null,
      referenceAeLevel: OPPORTUNITY_REFERENCE_AE,
    });
    expect(enriched[1]).toMatchObject({
      bestBonus: null,
      bestRegionId: "r2",
      bestRegionName: "Tehran",
      roughDailyValue: null,
    });
  });
});
