import { describe, expect, it } from "vite-plus/test";
import { BASE_HP_LOSS_PER_HIT, dmgPerHit, hpLossPerHit } from "./dmg-hit";

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
  it("costs base hp with no armor or dodge", () => {
    expect(hpLossPerHit(0, 0)).toBe(BASE_HP_LOSS_PER_HIT);
    expect(BASE_HP_LOSS_PER_HIT).toBe(10);
  });

  it("applies armor and dodge diminishing returns separately (Sanna)", () => {
    // 10 * (40/(40+75)) * (40/(40+47))
    expect(hpLossPerHit(75, 47)).toBeCloseTo(1.5992003998000999);
    // 10 * (40/(40+106)) * (40/(40+59))
    expect(hpLossPerHit(106, 59)).toBeCloseTo(1.1069600110696);
  });

  it("decreases when either armor or dodge increases", () => {
    expect(hpLossPerHit(40, 0)).toBeCloseTo(5);
    expect(hpLossPerHit(40, 40)).toBeLessThan(hpLossPerHit(40, 0));
    expect(hpLossPerHit(40, 40)).toBeLessThan(hpLossPerHit(0, 40));
  });
});
