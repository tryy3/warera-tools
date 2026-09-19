import { moneyToNumber } from "@/money/decimal";

export function exclFromIncl(
  incl: string | number | null | undefined,
  taxRate: number | null | undefined,
): number | null {
  const price = moneyToNumber(incl);
  if (price == null || taxRate == null) return null;
  if (!Number.isFinite(taxRate)) return null;
  const divisor = 1 + taxRate;
  if (!(divisor > 0)) return null;
  return price / divisor;
}
