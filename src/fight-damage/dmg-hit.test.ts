import { describe, expect, it } from "vite-plus/test";
import { dmgPerHit, hpLossPerHit } from "./dmg-hit";

describe("dmgPerHit", () => {
  it("combines precision, critical hits, and half-damage misses", () => {
    expect(
      dmgPerHit({
        atk: 100,
        precision: 0.8,
        critChance: 0.25,
        critDamage: 2,
      }),
    ).toBeCloseTo(130);
  });
});

describe("hpLossPerHit", () => {
  it("costs one hp with no armor or dodge", () => {
    expect(hpLossPerHit(0, 0)).toBe(1);
  });

  it("decreases as combined armor and dodge increase", () => {
    expect(hpLossPerHit(40, 0)).toBeCloseTo(0.5);
    expect(hpLossPerHit(40, 40)).toBeLessThan(hpLossPerHit(40, 0));
  });
});
