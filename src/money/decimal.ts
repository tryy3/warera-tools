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

export function moneyEquals(a: Decimal | null | undefined, b: Decimal | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.equals(b);
}

/** Coerce money to a finite number (bridge until Task 7 wires Decimal end-to-end). */
export function moneyToNumber(value: Decimal | number | string | null | undefined): number | null {
  const parsed = parseMoney(value ?? null);
  if (parsed == null) return null;
  const n = parsed.toNumber();
  return Number.isFinite(n) ? n : null;
}
