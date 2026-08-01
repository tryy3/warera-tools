export const PRICE_HISTORY_RANGES = ["24h", "7d", "30d"] as const;
export type PriceHistoryRange = (typeof PRICE_HISTORY_RANGES)[number];

const RANGE_MS: Record<PriceHistoryRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function parsePriceHistoryRange(value: unknown): PriceHistoryRange {
  if (typeof value === "string" && (PRICE_HISTORY_RANGES as readonly string[]).includes(value)) {
    return value as PriceHistoryRange;
  }
  return "7d";
}

export function rangeToMs(range: PriceHistoryRange): number {
  return RANGE_MS[range];
}
