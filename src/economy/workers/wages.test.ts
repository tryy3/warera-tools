import { describe, expect, it } from "vite-plus/test";
import { maxGrossWagePerPp, netWageFromGross, wagePair } from "./wages";

describe("netWageFromGross", () => {
  it("applies tax as fraction", () => {
    expect(netWageFromGross(0.135, 0.1)).toBeCloseTo(0.1215, 6);
  });

  it("treats tax 0 as identity", () => {
    expect(netWageFromGross(0.2, 0)).toBe(0.2);
  });
});

describe("maxGrossWagePerPp", () => {
  it("is profit/PP times (1 + production bonus) at 0% fidelity", () => {
    expect(maxGrossWagePerPp(0.083, 0.605)).toBeCloseTo(0.083 * 1.605, 6);
    expect(maxGrossWagePerPp(0.134, 0)).toBe(0.134);
  });
});

describe("wagePair", () => {
  it("returns gross and net", () => {
    expect(wagePair(1, 0.25)).toEqual({ gross: 1, net: 0.75 });
  });
});
