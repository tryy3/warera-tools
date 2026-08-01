import { describe, expect, it } from "vite-plus/test";
import { parsePriceHistoryRange, rangeToMs } from "./ranges";

describe("parsePriceHistoryRange", () => {
  it("accepts known ranges", () => {
    expect(parsePriceHistoryRange("24h")).toBe("24h");
    expect(parsePriceHistoryRange("7d")).toBe("7d");
    expect(parsePriceHistoryRange("30d")).toBe("30d");
  });

  it("coerces bad or missing values to 7d", () => {
    expect(parsePriceHistoryRange(undefined)).toBe("7d");
    expect(parsePriceHistoryRange("")).toBe("7d");
    expect(parsePriceHistoryRange("1y")).toBe("7d");
    expect(parsePriceHistoryRange(7)).toBe("7d");
  });
});

describe("rangeToMs", () => {
  it("maps ranges to durations", () => {
    expect(rangeToMs("24h")).toBe(24 * 60 * 60 * 1000);
    expect(rangeToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(rangeToMs("30d")).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
