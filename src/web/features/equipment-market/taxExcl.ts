export function exclFromIncl(
  incl: number | null | undefined,
  taxRate: number | null | undefined,
): number | null {
  if (incl == null || taxRate == null) return null;
  if (!Number.isFinite(incl) || !Number.isFinite(taxRate)) return null;
  const divisor = 1 + taxRate;
  if (!(divisor > 0)) return null;
  return incl / divisor;
}
