import { Decimal } from "./decimal";

/** Test/fixture helper: finite money Decimal from a JS number. */
export function d(value: number | string): Decimal {
  return new Decimal(value);
}

export function moneyMap(entries: Record<string, number>): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const [k, v] of Object.entries(entries)) out[k] = d(v);
  return out;
}
