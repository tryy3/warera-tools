/**
 * Format a number for human-facing labels and formula strings.
 * Uses standard rounding; maxFractionDigits capped at 4 by callers for economy UI.
 * Always uses `.` as decimal separator (not locale) so formulas stay stable in tests.
 */
export function formatDisplayNumber(value: number, maxFractionDigits = 4): string {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.min(Math.max(0, maxFractionDigits), 20);
  // Trim trailing zeros after rounding
  return Number(value.toFixed(digits)).toString();
}
