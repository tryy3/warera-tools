import { parseMoney, type Decimal } from "../money/decimal";

export type FormatDisplayNumberOptions = {
  /** Insert a space every three digits in the integer part (e.g. 100000 → "100 000"). */
  groupThousands?: boolean;
};

/**
 * Format a number for human-facing labels and formula strings.
 * Uses standard rounding; maxFractionDigits capped at 4 by callers for economy UI.
 * Always uses `.` as decimal separator (not locale) so formulas stay stable in tests.
 * Thousand grouping is opt-in so formula strings stay ungrouped by default.
 */
export function formatDisplayNumber(
  value: number | Decimal | string,
  maxFractionDigits = 4,
  options?: FormatDisplayNumberOptions,
): string {
  const parsed = parseMoney(value);
  if (parsed == null || !parsed.isFinite()) return "—";
  const digits = Math.min(Math.max(0, maxFractionDigits), 20);
  // Trim trailing zeros after rounding (same as Number(toFixed).toString())
  const raw = Number(parsed.toFixed(digits)).toString();
  if (!options?.groupThousands) return raw;

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [integerPart, fractionPart] = unsigned.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const body = fractionPart != null ? `${grouped}.${fractionPart}` : grouped;
  return negative ? `-${body}` : body;
}
