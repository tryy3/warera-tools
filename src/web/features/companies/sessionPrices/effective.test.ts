import { describe, expect, it } from "vite-plus/test";
import type { Opportunity } from "../types";
import {
  bookFromOpportunities,
  isItemDirty,
  mergeBookPrices,
  pruneOverrides,
  recomputeOpportunity,
} from "./effective";

function moneyWire(value: string | number | null | undefined, fallback: string): string {
  if (value == null) return fallback;
  return typeof value === "number" ? String(value) : value;
}

function opp(
  partial: Pick<Opportunity, "itemCode"> & {
    marketPrice?: string | number;
    buyPrice?: string | number | null;
    sellPrice?: string | number;
    inputCost?: string | number;
    unitProfit?: string | number;
    consumedPp?: number;
    profitPerPp?: string | number | null;
    formula?: string;
    bestBonus?: number | null;
    bestRegionId?: string | null;
    bestRegionName?: string | null;
    roughDailyValue?: string | number | null;
    referenceAeLevel?: number;
  },
): Opportunity {
  return {
    itemCode: partial.itemCode,
    marketPrice: moneyWire(partial.marketPrice, "1"),
    buyPrice: partial.buyPrice === null ? null : moneyWire(partial.buyPrice, "0.9"),
    sellPrice: moneyWire(partial.sellPrice, "1.1"),
    inputCost: moneyWire(partial.inputCost, "0"),
    unitProfit: moneyWire(partial.unitProfit, "1.1"),
    consumedPp: partial.consumedPp ?? 1,
    profitPerPp: partial.profitPerPp === null ? null : moneyWire(partial.profitPerPp, "1.1"),
    formula: partial.formula ?? "test",
    bestBonus: partial.bestBonus ?? 0.5,
    bestRegionId: partial.bestRegionId ?? "r1",
    bestRegionName: partial.bestRegionName ?? "Region",
    roughDailyValue:
      partial.roughDailyValue === null ? null : moneyWire(partial.roughDailyValue, "100"),
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
    expect(merged.buy.iron?.toString()).toBe("0.09");
    expect(merged.sell.iron?.toString()).toBe("0.06");
    expect(merged.buy.steel?.toString()).toBe("0.8");
    expect(merged.sell.steel?.toString()).toBe("1.2");
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
    expect(Number(next.inputCost)).toBeCloseTo(0.9, 8);
    expect(Number(next.unitProfit)).toBeCloseTo(0.1, 8);
    expect(Number(next.profitPerPp)).toBeCloseTo(0.01, 8);
    expect(Number(next.roughDailyValue)).toBeCloseTo(6 * 1.5 * 24 * 0.01, 8);
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
