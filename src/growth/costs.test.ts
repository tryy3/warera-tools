import { describe, expect, it } from "vite-plus/test";
import { concreteForNewCompany, steelForAeUpgrade } from "./costs";

describe("concreteForNewCompany", () => {
  it("scales linearly by 50", () => {
    expect(concreteForNewCompany(1)).toBe(50);
    expect(concreteForNewCompany(2)).toBe(100);
    expect(concreteForNewCompany(3)).toBe(150);
    expect(concreteForNewCompany(12)).toBe(600);
  });
});

describe("steelForAeUpgrade", () => {
  it("matches wiki doubling table", () => {
    expect(steelForAeUpgrade(1)).toBe(20);
    expect(steelForAeUpgrade(2)).toBe(40);
    expect(steelForAeUpgrade(3)).toBe(80);
    expect(steelForAeUpgrade(4)).toBe(160);
    expect(steelForAeUpgrade(5)).toBe(320);
    expect(steelForAeUpgrade(6)).toBe(640);
  });
});
