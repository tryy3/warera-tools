import { describe, expect, it } from "vite-plus/test";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import { buildEquipmentOverview } from "./overview";

function tx(
  overrides: Partial<ItemMarketTxRow> & Pick<ItemMarketTxRow, "id" | "money" | "itemCode">,
): ItemMarketTxRow {
  return {
    skills: null,
    createdAt: new Date("2026-08-05T12:00:00.000Z"),
    ...overrides,
  };
}

describe("buildEquipmentOverview", () => {
  it("groups sales by itemCode and computes median, scrap floor, and spread", () => {
    const scrapPrice = 0.2;
    const items = buildEquipmentOverview(
      [
        tx({ id: "a", itemCode: "chest4", money: 40 }),
        tx({ id: "b", itemCode: "chest4", money: 50 }),
      ],
      scrapPrice,
    );

    expect(items).toHaveLength(1);
    const row = items[0]!;
    expect(row.itemCode).toBe("chest4");
    expect(row.tier).toBe("purple");
    expect(row.marketMedian).toBe(45);
    expect(row.trades).toBe(2);
    // purple = 162 scraps
    expect(row.scrapFloor).toBe(162 * scrapPrice);
    expect(row.spread).toBe(45 - 162 * scrapPrice);
  });

  it("does not invent zero-trade item codes", () => {
    const items = buildEquipmentOverview([tx({ id: "a", itemCode: "helmet4", money: 30 })], 0.2);
    expect(items.map((r) => r.itemCode)).toEqual(["helmet4"]);
    expect(items.every((r) => r.trades > 0)).toBe(true);
  });

  it("returns null scrap floor and spread when scrap price or tier is missing", () => {
    const noScrap = buildEquipmentOverview([tx({ id: "a", itemCode: "chest4", money: 40 })], null);
    expect(noScrap[0]).toMatchObject({
      marketMedian: 40,
      scrapFloor: null,
      spread: null,
    });

    const unknownTier = buildEquipmentOverview(
      [tx({ id: "b", itemCode: "unknownWeapon", money: 100 })],
      0.2,
    );
    expect(unknownTier[0]).toMatchObject({
      tier: null,
      marketMedian: 100,
      scrapFloor: null,
      spread: null,
    });
  });
});
