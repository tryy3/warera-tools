import { calculateProfitPerPp, explainAeDaily, type BookPrices } from "../../../../economy/profit";
import type { Opportunity } from "../types";
import type { ItemPriceOverride, ItemPriceOverrides } from "./types";

/** Build live buy/sell maps from opportunity rows (one entry per producible item). */
export function bookFromOpportunities(opportunities: readonly Opportunity[]): BookPrices {
  const buy: Record<string, number> = {};
  const sell: Record<string, number> = {};
  for (const o of opportunities) {
    if (o.buyPrice != null && Number.isFinite(o.buyPrice)) buy[o.itemCode] = o.buyPrice;
    if (o.sellPrice != null && Number.isFinite(o.sellPrice)) sell[o.itemCode] = o.sellPrice;
  }
  return { buy, sell };
}

export function mergeBookPrices(live: BookPrices, overrides: ItemPriceOverrides): BookPrices {
  const buy = { ...live.buy };
  const sell = { ...live.sell };
  for (const [itemCode, override] of Object.entries(overrides)) {
    if (override.buy != null && Number.isFinite(override.buy)) buy[itemCode] = override.buy;
    if (override.sell != null && Number.isFinite(override.sell)) sell[itemCode] = override.sell;
  }
  return { buy, sell };
}

export function isSideDirty(
  overrides: ItemPriceOverrides,
  itemCode: string,
  side: keyof ItemPriceOverride,
): boolean {
  const value = overrides[itemCode]?.[side];
  return value != null && Number.isFinite(value);
}

export function isItemDirty(overrides: ItemPriceOverrides, itemCode: string): boolean {
  return isSideDirty(overrides, itemCode, "buy") || isSideDirty(overrides, itemCode, "sell");
}

/** Recompute opportunity economics from an effective book; keeps region hints. */
export function recomputeOpportunity(live: Opportunity, book: BookPrices): Opportunity {
  const breakdown = calculateProfitPerPp(live.itemCode, book);
  if (!breakdown) return live;

  const buyPrice =
    book.buy[live.itemCode] != null && Number.isFinite(book.buy[live.itemCode]!)
      ? book.buy[live.itemCode]!
      : null;
  const sellPrice =
    book.sell[live.itemCode] != null && Number.isFinite(book.sell[live.itemCode]!)
      ? book.sell[live.itemCode]!
      : breakdown.sellPrice;

  const hasBonus = live.bestBonus != null && Number.isFinite(live.bestBonus);
  const hasPp = breakdown.profitPerPp != null && Number.isFinite(breakdown.profitPerPp);

  return {
    ...live,
    marketPrice: breakdown.marketPrice,
    buyPrice,
    sellPrice,
    inputCost: breakdown.inputCost,
    unitProfit: breakdown.unitProfit,
    consumedPp: breakdown.consumedPp,
    profitPerPp: breakdown.profitPerPp,
    formula: breakdown.formula,
    roughDailyValue:
      hasBonus && hasPp
        ? explainAeDaily(live.referenceAeLevel, live.bestBonus!, breakdown.profitPerPp!).dailyValue
        : null,
  };
}

export function recomputeOpportunities(
  live: readonly Opportunity[],
  book: BookPrices,
): Opportunity[] {
  return live.map((o) => recomputeOpportunity(o, book));
}

export function effectiveProfitForItem(
  itemCode: string | null | undefined,
  book: BookPrices,
): { profitPerPp: number | null; inputCost: number } | null {
  if (!itemCode) return null;
  const breakdown = calculateProfitPerPp(itemCode, book);
  if (!breakdown) return null;
  return {
    profitPerPp: breakdown.profitPerPp,
    inputCost: breakdown.inputCost,
  };
}

/** Clear empty override entries after removing a side. */
export function pruneOverrides(overrides: ItemPriceOverrides): ItemPriceOverrides {
  const next: ItemPriceOverrides = {};
  for (const [itemCode, override] of Object.entries(overrides)) {
    const buy = override.buy != null && Number.isFinite(override.buy) ? override.buy : undefined;
    const sell =
      override.sell != null && Number.isFinite(override.sell) ? override.sell : undefined;
    if (buy != null || sell != null) next[itemCode] = { buy, sell };
  }
  return next;
}
