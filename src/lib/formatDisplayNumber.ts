import { parseMoney, type Decimal } from "../money/decimal";

/**
 * Format a number for human-facing labels and formula strings.
 * Uses standard rounding; maxFractionDigits capped at 4 by callers for economy UI.
 * Always uses `.` as decimal separator (not locale) so formulas stay stable in tests.
 */
export function formatDisplayNumber(
  value: number | Decimal | string,
  maxFractionDigits = 4,
): string {
  const parsed = parseMoney(value);
  if (parsed == null || !parsed.isFinite()) return "—";
  const digits = Math.min(Math.max(0, maxFractionDigits), 20);
  // Trim trailing zeros after rounding (same as Number(toFixed).toString())
  return Number(parsed.toFixed(digits)).toString();
}
