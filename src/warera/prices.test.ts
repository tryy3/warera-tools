import { describe, expect, it } from "vite-plus/test";
import { parseItemPrices, parseScrapsPrice } from "./prices";
import { parseTopOrderAggregates } from "./top-orders";
import { wareraProcedurePath } from "./trpc";

describe("parseItemPrices", () => {
  it("keeps finite non-negative numbers", () => {
    expect(
      parseItemPrices({
        result: { data: { scraps: 0.2, steel: 1.6, bad: "x", neg: -1 } },
      }),
    ).toEqual({ scraps: 0.2, steel: 1.6 });
  });
});

describe("parseScrapsPrice", () => {
  it("reads result.data.scraps", () => {
    expect(parseScrapsPrice({ result: { data: { scraps: 0.215 } } })).toBe(0.215);
  });
  it("throws when missing", () => {
    expect(() => parseScrapsPrice({ result: { data: {} } })).toThrow();
  });
});

describe("parseTopOrderAggregates", () => {
  it("computes min max avg for buy and sell", () => {
    const result = parseTopOrderAggregates({
      result: {
        data: {
          buyOrders: [{ price: 0.08 }, { price: 0.1 }, { price: 0.09 }],
          sellOrders: [{ price: 0.11 }, { price: 0.12 }],
        },
      },
    });
    expect(result.buy.min).toBe(0.08);
    expect(result.buy.max).toBe(0.1);
    expect(result.buy.avg).toBeCloseTo(0.09);
    expect(result.sell.min).toBe(0.11);
    expect(result.sell.max).toBe(0.12);
    expect(result.sell.avg).toBeCloseTo(0.115);
  });
});

describe("wareraProcedurePath", () => {
  it("encodes input JSON", () => {
    expect(wareraProcedurePath("tradingOrder.getTopOrders", { itemCode: "lead", limit: 10 })).toBe(
      `tradingOrder.getTopOrders?input=${encodeURIComponent(JSON.stringify({ itemCode: "lead", limit: 10 }))}`,
    );
  });
});
