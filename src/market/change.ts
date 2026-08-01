export type PriceChange = { absolute: number; percent: number };

export function calculatePriceChange(
  current: number | null,
  baseline: number | null,
): PriceChange | null {
  if (
    current == null ||
    baseline == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(baseline) ||
    baseline === 0
  ) {
    return null;
  }
  const absolute = current - baseline;
  const percent = (absolute / baseline) * 100;
  return {
    absolute: parseFloat(absolute.toPrecision(12)),
    percent: parseFloat(percent.toPrecision(12)),
  };
}
