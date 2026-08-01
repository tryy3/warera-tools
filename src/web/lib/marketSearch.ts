import { parsePriceHistoryRange, type PriceHistoryRange } from "../../market/ranges";

export type MarketItemSearch = { range: PriceHistoryRange };

export function parseMarketItemSearch(search: Record<string, unknown>): MarketItemSearch {
  return { range: parsePriceHistoryRange(search.range) };
}
