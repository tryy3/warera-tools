import { describe, expect, it } from "vite-plus/test";
import { Decimal, moneyEquals, parseMoney, serializeMoney } from "./decimal";

describe("parseMoney", () => {
  it("parses string and number", () => {
    expect(parseMoney("12.345")?.equals(new Decimal("12.345"))).toBe(true);
    expect(parseMoney(1.5)?.equals(new Decimal("1.5"))).toBe(true);
  });

  it("returns null for nullish", () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("passes through Decimal", () => {
    const d = new Decimal("3");
    expect(parseMoney(d)).toBe(d);
  });
});

describe("serializeMoney", () => {
  it("serializes to fixed string without float noise", () => {
    expect(serializeMoney(new Decimal("10.1"))).toBe("10.1");
    expect(serializeMoney(null)).toBeNull();
  });
});

describe("moneyEquals", () => {
  it("compares null and values", () => {
    expect(moneyEquals(null, null)).toBe(true);
    expect(moneyEquals(parseMoney("1"), parseMoney("1.0"))).toBe(true);
    expect(moneyEquals(parseMoney("1"), null)).toBe(false);
  });
});
