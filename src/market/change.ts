import { isFiniteMoney, parseMoney, type Decimal } from "../money/decimal";

export type PriceChange = { absolute: number; percent: number };

export function calculatePriceChange(
  current: Decimal | number | null,
  baseline: Decimal | number | null,
): PriceChange | null {
  const cur = parseMoney(current);
  const base = parseMoney(baseline);
  if (!isFiniteMoney(cur) || !isFiniteMoney(base) || base.isZero()) {
    return null;
  }
  const absolute = cur.minus(base);
  const percent = absolute.div(base).times(100);
  return {
    absolute: parseFloat(absolute.toPrecision(12)),
    percent: parseFloat(percent.toPrecision(12)),
  };
}
