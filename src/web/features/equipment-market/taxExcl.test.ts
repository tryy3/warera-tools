import { describe, expect, it } from "vitest";
import { exclFromIncl } from "./taxExcl";

describe("exclFromIncl", () => {
  it("divides incl by (1 + taxRate)", () => {
    expect(exclFromIncl(40, 0.01)).toBeCloseTo(40 / 1.01, 10);
  });

  it("returns null when taxRate is missing", () => {
    expect(exclFromIncl(40, null)).toBeNull();
    expect(exclFromIncl(40, undefined)).toBeNull();
  });

  it("returns null when incl is missing or non-finite", () => {
    expect(exclFromIncl(null, 0.01)).toBeNull();
    expect(exclFromIncl(undefined, 0.01)).toBeNull();
    expect(exclFromIncl(Number.NaN, 0.01)).toBeNull();
  });

  it("returns null when taxRate is non-finite or divisor would be non-positive", () => {
    expect(exclFromIncl(40, Number.NaN)).toBeNull();
    expect(exclFromIncl(40, -1)).toBeNull();
    expect(exclFromIncl(40, -1.5)).toBeNull();
  });
});
