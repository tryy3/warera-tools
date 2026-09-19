import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { moneyToNumber } from "@/money/decimal";

/** Format API/wire money (string | number) for display. */
export function formatMoneyDisplay(value: string | number | null | undefined, digits = 4): string {
  const n = moneyToNumber(value);
  if (n == null) return "—";
  return formatDisplayNumber(n, digits);
}
