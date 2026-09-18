import { customType } from "drizzle-orm/pg-core";
import { Decimal, parseMoney } from "../money/decimal";

/** Postgres numeric(20,6) mapped to decimal.js Decimal (nullable at column level). */
export const moneyNumeric = customType<{ data: Decimal; driverData: string }>({
  dataType() {
    return "numeric(20, 6)";
  },
  toDriver(value: Decimal): string {
    return value.toFixed();
  },
  fromDriver(value: unknown): Decimal {
    const parsed = parseMoney(value as string | number);
    if (!parsed) throw new Error(`Invalid money value from driver: ${String(value)}`);
    return parsed;
  },
});
