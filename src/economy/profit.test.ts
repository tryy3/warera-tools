import { describe, expect, it } from "vite-plus/test";
import {
  aeDailyValue,
  calculateProfitPerPp,
  explainAeDaily,
  listMarketOpportunities,
  paybackDays,
  transferCostGold,
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
