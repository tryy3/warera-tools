import { describe, expect, it } from "vite-plus/test";
import { calculateProfit, scrapAmountForTier } from "./index";

describe("scrapAmountForTier", () => {
  it("returns hard-coded yields", () => {
    expect(scrapAmountForTier("gray")).toBe(6);
    expect(scrapAmountForTier("green")).toBe(18);
    expect(scrapAmountForTier("blue")).toBe(54);
    expect(scrapAmountForTier("purple")).toBe(162);
    expect(scrapAmountForTier("yellow")).toBe(486);
    expect(scrapAmountForTier("red")).toBe(1458);
  });
});

describe("calculateProfit", () => {
  it("matches green-helmet worked example", () => {
    const result = calculateProfit({
      scrapPrice: 0.215,
      scrapAmount: 18,
      inclPrice: 3.9,
      taxRate: 0.01,
    });
    expect(result.dismantleValue).toBeCloseTo(3.87, 5);
    expect(result.exclPrice).toBeCloseTo(3.8613861386, 5);
    expect(result.profit).toBeCloseTo(3.8613861386 - 3.87, 5);
    expect(result.inclPrice).toBe(3.9);
  });
});
