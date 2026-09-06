import { describe, expect, it } from "vite-plus/test";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import { buildCraftCompare, craftCostForTier, itemCodesForTier } from "./craft";

function tx(
  overrides: Partial<ItemMarketTxRow> & Pick<ItemMarketTxRow, "id" | "money" | "itemCode">,
): ItemMarketTxRow {
  return {
    skills: null,
    createdAt: new Date("2026-08-05T12:00:00.000Z"),
    ...overrides,
  };
}

describe("craftCostForTier", () => {
  it("returns mythic craft costs (not dismantle yields)", () => {
    expect(craftCostForTier("red")).toEqual({
      scrapQty: 1460,
      steelRandom: 32,
      steelSpecific: 64,
    });
  });

  it("returns common craft costs", () => {
    expect(craftCostForTier("gray")).toEqual({
      scrapQty: 6,
      steelRandom: 1,
      steelSpecific: 2,
    });
  });
});

describe("itemCodesForTier", () => {
  it("lists weapon then armor for mythic", () => {
    expect(itemCodesForTier("red")).toEqual([
      "jet",
      "helmet6",
      "chest6",
      "gloves6",
      "pants6",
      "boots6",
    ]);
  });

  it("lists knife and gray armor for common", () => {
    expect(itemCodesForTier("gray")[0]).toBe("knife");
    expect(itemCodesForTier("gray")).toContain("boots1");
  });
});

describe("buildCraftCompare", () => {
  const taxRate = 0.01;
  const scrapPrice = 0.2;
  const steelPrice = 1.5;

  it("computes sell-scrap baseline costs and per-item advantages", () => {
    // jet sales incl 500 and 600 → excl = money/1.01
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice,
      steelPrice,
      taxRate,
      txs: [
        tx({ id: "1", itemCode: "jet", money: 500 }),
        tx({ id: "2", itemCode: "jet", money: 600 }),
        tx({ id: "3", itemCode: "helmet6", money: 400 }),
      ],
    });

    expect(result.scrapQty).toBe(1460);
    expect(result.scrapValue).toBeCloseTo(1460 * 0.2, 10);
    expect(result.steelCostRandom).toBeCloseTo(32 * 1.5, 10);
    expect(result.steelCostSpecific).toBeCloseTo(64 * 1.5, 10);
    expect(result.itemCount).toBe(6);
    expect(result.pricedItemCount).toBe(2);

    const jet = result.specific.find((r) => r.itemCode === "jet")!;
    const jetMinExcl = 500 / 1.01;
    const jetMaxExcl = 600 / 1.01;
    const jetMedExcl = (500 / 1.01 + 600 / 1.01) / 2;
    expect(jet.minExcl).toBeCloseTo(jetMinExcl, 10);
    expect(jet.maxExcl).toBeCloseTo(jetMaxExcl, 10);
    expect(jet.medianExcl).toBeCloseTo(jetMedExcl, 10);
    expect(jet.medianAdvantage).toBeCloseTo(jetMedExcl - 64 * 1.5 - 1460 * 0.2, 10);
    expect(jet.trades).toBe(2);

    // unpriced specific rows still present
    expect(result.specific.some((r) => r.itemCode === "boots6" && r.trades === 0)).toBe(true);

    // sorted by median advantage desc; nulls last
    const medians = result.specific.map((r) => r.medianAdvantage);
    const defined = medians.filter((v) => v != null) as number[];
    for (let i = 1; i < defined.length; i++) {
      expect(defined[i]! <= defined[i - 1]!).toBe(true);
    }
    expect(result.specific.at(-1)!.medianAdvantage).toBeNull();
  });

  it("builds random pool from equal-weight item medians and half steel", () => {
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice,
      steelPrice,
      taxRate,
      txs: [
        tx({ id: "1", itemCode: "jet", money: 505 }), // excl ~500
        tx({ id: "2", itemCode: "helmet6", money: 303 }), // excl ~300
      ],
    });

    const jetMed = 505 / 1.01;
    const helmMed = 303 / 1.01;
    const typical = (jetMed + helmMed) / 2;
    expect(result.random.medianExcl).toBeCloseTo(typical, 10);
    expect(result.random.minExcl).toBeCloseTo(Math.min(jetMed, helmMed), 10);
    expect(result.random.maxExcl).toBeCloseTo(Math.max(jetMed, helmMed), 10);
    expect(result.random.medianAdvantage).toBeCloseTo(typical - 32 * 1.5 - 1460 * 0.2, 10);
    expect(result.random.trades).toBe(2);
  });

  it("returns null advantages when scrap or steel price missing", () => {
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice: null,
      steelPrice: 1.5,
      taxRate,
      txs: [tx({ id: "1", itemCode: "jet", money: 500 })],
    });
    expect(result.scrapValue).toBeNull();
    expect(result.specific.find((r) => r.itemCode === "jet")!.medianAdvantage).toBeNull();
    expect(result.random.medianAdvantage).toBeNull();
  });

  it("returns null random stats when no priced items", () => {
    const result = buildCraftCompare({
      tier: "red",
      scrapPrice,
      steelPrice,
      taxRate,
      txs: [],
    });
    expect(result.pricedItemCount).toBe(0);
    expect(result.random.minExcl).toBeNull();
    expect(result.random.medianExcl).toBeNull();
    expect(result.random.maxExcl).toBeNull();
    expect(result.random.trades).toBe(0);
  });
});
