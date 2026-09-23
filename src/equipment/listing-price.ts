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
  const ratio = new Decimal(ISOLATED_PRICE_RATIO);
  let lo = 0;
  let hi = sorted.length - 1;

  while (hi - lo >= 1) {
    const low = sorted[lo]!;
    const next = sorted[lo + 1]!;
    const high = sorted[hi]!;
    const prev = sorted[hi - 1]!;
    const cheap = low.lt(next.times(ratio));
    const rich = high.gt(prev.div(ratio));
    if (hi - lo === 1) {
      if (cheap) lo += 1;
      break;
    }
    if (!cheap && !rich) break;
    if (cheap) lo += 1;
    if (rich) hi -= 1;
  }

  return median(sorted.slice(lo, hi + 1));
}

export function priceBounds(values: Array<Decimal | number>): {
  low: Decimal | null;
  high: Decimal | null;
} {
  if (values.length === 0) return { low: null, high: null };
  const sorted = sortedMoney(values);
  return { low: sorted[0]!, high: sorted[sorted.length - 1]! };
}
