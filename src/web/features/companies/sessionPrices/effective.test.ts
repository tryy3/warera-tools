import { describe, expect, it } from "vite-plus/test";
import type { Opportunity } from "../types";
import {
  bookFromOpportunities,
  isItemDirty,
  mergeBookPrices,
  pruneOverrides,
  recomputeOpportunity,
} from "./effective";

function opp(partial: Partial<Opportunity> & Pick<Opportunity, "itemCode">): Opportunity {
  return {
    itemCode: partial.itemCode,
    marketPrice: partial.marketPrice ?? 1,
    buyPrice: partial.buyPrice ?? 0.9,
    sellPrice: partial.sellPrice ?? 1.1,
    inputCost: partial.inputCost ?? 0,
    unitProfit: partial.unitProfit ?? 1.1,
    consumedPp: partial.consumedPp ?? 1,
    profitPerPp: partial.profitPerPp ?? 1.1,
    formula: partial.formula ?? "test",
    bestBonus: partial.bestBonus ?? 0.5,
    bestRegionId: partial.bestRegionId ?? "r1",
    bestRegionName: partial.bestRegionName ?? "Region",
    roughDailyValue: partial.roughDailyValue ?? 100,
    referenceAeLevel: partial.referenceAeLevel ?? 6,
  };
}

describe("session price board helpers", () => {
  it("merges overrides onto live book by itemCode", () => {
    const live = bookFromOpportunities([
      opp({ itemCode: "iron", buyPrice: 0.05, sellPrice: 0.06 }),
      opp({ itemCode: "steel", buyPrice: 0.8, sellPrice: 1 }),
    ]);
    const merged = mergeBookPrices(live, { iron: { buy: 0.09 }, steel: { sell: 1.2 } });
    expect(merged.buy.iron).toBe(0.09);
    expect(merged.sell.iron).toBe(0.06);
    expect(merged.buy.steel).toBe(0.8);
    expect(merged.sell.steel).toBe(1.2);
  });

  it("recomputes steel Profit/PP when iron buy is overridden", () => {
    const steelLive = opp({
      itemCode: "steel",
      buyPrice: 0.8,
      sellPrice: 1,
      consumedPp: 10,
      bestBonus: 0.5,
      referenceAeLevel: 6,
    });
    const book = mergeBookPrices(
      {
        buy: { iron: 0.05, steel: 0.8 },
        sell: { iron: 0.06, steel: 1 },
      },
      { iron: { buy: 0.09 } },
    );
    const next = recomputeOpportunity(steelLive, book);
    // unitProfit = 1 − 10×0.09 = 0.1; G/PP = 0.01
    expect(next.inputCost).toBeCloseTo(0.9, 8);
    expect(next.unitProfit).toBeCloseTo(0.1, 8);
    expect(next.profitPerPp).toBeCloseTo(0.01, 8);
    expect(next.roughDailyValue).toBeCloseTo(6 * 1.5 * 24 * 0.01, 8);
    expect(next.formula).toContain("sell");
  });

  it("tracks dirty sides and prunes empty overrides", () => {
    expect(isItemDirty({ iron: { buy: 0.1 } }, "iron")).toBe(true);
    expect(isItemDirty({ iron: { buy: 0.1 } }, "steel")).toBe(false);
    expect(
      pruneOverrides({ iron: { buy: undefined, sell: undefined }, steel: { sell: 2 } }),
    ).toEqual({
      steel: { sell: 2 },
    });
  });
});
