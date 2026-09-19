import { calculateProfitPerPp, explainAeDaily, type BookPrices } from "../../../../economy/profit";
import { Decimal, isFiniteMoney, parseMoney } from "../../../../money/decimal";
import type { Opportunity } from "../types";
import type { ItemPriceOverride, ItemPriceOverrides } from "./types";

/** Build live buy/sell maps from opportunity rows (one entry per producible item). */
export function bookFromOpportunities(opportunities: readonly Opportunity[]): BookPrices {
  const buy: Record<string, Decimal> = {};
  const sell: Record<string, Decimal> = {};
  for (const o of opportunities) {
    const buyP = parseMoney(o.buyPrice);
    const sellP = parseMoney(o.sellPrice);
    if (isFiniteMoney(buyP)) buy[o.itemCode] = buyP;
    if (isFiniteMoney(sellP)) sell[o.itemCode] = sellP;
  }
  return { buy, sell };
}

export function mergeBookPrices(live: BookPrices, overrides: ItemPriceOverrides): BookPrices {
  const buy = { ...live.buy };
  const sell = { ...live.sell };
  for (const [itemCode, override] of Object.entries(overrides)) {
    if (override.buy != null && Number.isFinite(override.buy)) {
      buy[itemCode] = new Decimal(override.buy);
    }
    if (override.sell != null && Number.isFinite(override.sell)) {
      sell[itemCode] = new Decimal(override.sell);
    }
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

  const buyCandidate = parseMoney(book.buy[live.itemCode]);
  const buyPrice = isFiniteMoney(buyCandidate) ? buyCandidate.toFixed() : null;
  const sellCandidate = parseMoney(book.sell[live.itemCode]);
  const sellPrice = isFiniteMoney(sellCandidate)
    ? sellCandidate.toFixed()
    : breakdown.sellPrice.toFixed();

  const hasBonus = live.bestBonus != null && Number.isFinite(live.bestBonus);
  const hasPp = isFiniteMoney(breakdown.profitPerPp);

  return {
    ...live,
    marketPrice: breakdown.marketPrice.toFixed(),
    buyPrice,
    sellPrice,
    inputCost: breakdown.inputCost.toFixed(),
    unitProfit: breakdown.unitProfit.toFixed(),
    consumedPp: breakdown.consumedPp,
    profitPerPp: breakdown.profitPerPp?.toFixed() ?? null,
    formula: breakdown.formula,
    roughDailyValue:
      hasBonus && hasPp
        ? explainAeDaily(
            live.referenceAeLevel,
            live.bestBonus!,
            breakdown.profitPerPp!,
          ).dailyValue.toFixed()
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
    profitPerPp: isFiniteMoney(breakdown.profitPerPp) ? breakdown.profitPerPp.toNumber() : null,
    inputCost: breakdown.inputCost.toNumber(),
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
