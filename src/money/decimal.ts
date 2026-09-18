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
