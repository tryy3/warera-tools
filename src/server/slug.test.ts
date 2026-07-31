import { describe, expect, it } from "vite-plus/test";
import { parseTaxRate, slugifyCountryId } from "./slug";

describe("slugifyCountryId", () => {
  it("slugifies names", () => {
    expect(slugifyCountryId("Sweden")).toBe("sweden");
    expect(slugifyCountryId("United States")).toBe("united-states");
  });
});

describe("parseTaxRate", () => {
  it("accepts 0..1", () => {
    expect(parseTaxRate(0.01)).toBe(0.01);
  });
  it("rejects out of range", () => {
    expect(() => parseTaxRate(1.5)).toThrow();
    expect(() => parseTaxRate(-0.1)).toThrow();
  });
});
