import { Decimal, parseMoney } from "../money/decimal";

export function median(values: Array<Decimal | number>): Decimal | null {
  if (values.length === 0) return null;
  const decimals = values.map((value) => parseMoney(value)!);
  const sorted = [...decimals].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return sorted[mid - 1]!.plus(sorted[mid]!).div(2);
}
