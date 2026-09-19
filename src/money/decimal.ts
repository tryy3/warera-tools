import { Decimal } from "decimal.js";

export { Decimal };

export function parseMoney(value: string | number | Decimal | null | undefined): Decimal | null {
  if (value == null) return null;
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

export function serializeMoney(value: Decimal | null | undefined): string | null {
  if (value == null) return null;
  // Avoid exponential form for API/DB friendliness
  return value.toFixed();
}

export function serializeMoneyMap(map: Record<string, Decimal>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    const serialized = serializeMoney(value);
    if (serialized != null) out[key] = serialized;
  }
  return out;
}

export function moneyEquals(a: Decimal | null | undefined, b: Decimal | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.equals(b);
}

export function isFiniteMoney(value: Decimal | null | undefined): value is Decimal {
  return value != null && value.isFinite();
}

/**
 * Chart / display bridge only — prefer Decimal math in domain code.
 * Returns null when missing or non-finite.
 */
export function moneyToNumber(value: Decimal | number | string | null | undefined): number | null {
  const parsed = parseMoney(value ?? null);
  if (parsed == null || !parsed.isFinite()) return null;
  const n = parsed.toNumber();
  return Number.isFinite(n) ? n : null;
}
