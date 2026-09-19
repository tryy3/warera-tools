import { customType } from "drizzle-orm/pg-core";
import { Decimal, parseMoney } from "../money/decimal";

/** Postgres numeric(20,6) mapped to decimal.js Decimal (nullable at column level). */
export const moneyNumeric = customType<{ data: Decimal; driverData: string }>({
  dataType() {
    return "numeric(20, 6)";
  },
  toDriver(value: Decimal | number | string): string {
    // Coerce number/string so callers not yet on Decimal (Task 7) don't hit
    // Number#toFixed() default (0 fraction digits) and round money away.
    const parsed = parseMoney(value);
    if (!parsed) throw new Error(`Invalid money value for driver: ${String(value)}`);
    return parsed.toFixed();
  },
  fromDriver(value: unknown): Decimal {
    const parsed = parseMoney(value as string | number);
    if (!parsed) throw new Error(`Invalid money value from driver: ${String(value)}`);
    return parsed;
  },
});
