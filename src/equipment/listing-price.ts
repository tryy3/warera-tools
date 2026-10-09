import { Decimal, parseMoney } from "../money/decimal";
import { median } from "./median";

/**
 * A sale this far below the next price (or above the previous) is a one-off
 * snipe or overpay, not the price to list at.
 * 12.2 vs 15.0 is about 0.81 and gets dropped; a 5% spread stays.
 */
export const ISOLATED_PRICE_RATIO = 0.9;

function sortedMoney(values: Array<Decimal | number>): Decimal[] {
  return values.map((value) => parseMoney(value)!).sort((a, b) => a.comparedTo(b));
}

/**
 * Median after peeling isolated cheap fills and isolated overpays off the ends.
 * Two sales far apart keep the higher one, so a snipe is not averaged with a fair sale.
 */
export function listingPrice(values: Array<Decimal | number>): Decimal | null {
  if (values.length === 0) return null;
  const sorted = sortedMoney(values);
  const last = sorted.length - 1;
  if (last === 0) return sorted[0]!;

  const ratio = new Decimal(ISOLATED_PRICE_RATIO);
  const cheap = sorted[0]!.lt(sorted[1]!.times(ratio));
  if (last === 1) return cheap ? sorted[1]! : median(sorted);

  // One pass per end: peeling repeatedly would eat a smooth spread of prices from the bottom.
  const rich = sorted[last]!.gt(sorted[last - 1]!.div(ratio));
  return median(sorted.slice(cheap ? 1 : 0, rich ? last : last + 1));
}

export function priceBounds(values: Array<Decimal | number>): {
  low: Decimal | null;
  high: Decimal | null;
} {
  if (values.length === 0) return { low: null, high: null };
  const sorted = sortedMoney(values);
  return { low: sorted[0]!, high: sorted[sorted.length - 1]! };
}
