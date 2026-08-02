import { describe, expect, it } from "vite-plus/test";
import { goldCostAfterInventory, waitHoursToAfford } from "./afford";

describe("goldCostAfterInventory", () => {
  it("uses inventory before market gold", () => {
    const { goldNeeded, nextWallet } = goldCostAfterInventory(
      { gold: 100, steel: 10, concrete: 5 },
      { steel: 20, concrete: 10 },
      { steel: 2, concrete: 1 },
    );
    // need 10 more steel => 20G, 5 more concrete => 5G
    expect(goldNeeded).toBeCloseTo(25);
    expect(nextWallet.steel).toBe(0);
    expect(nextWallet.concrete).toBe(0);
    expect(nextWallet.gold).toBe(100); // gold not deducted here
  });

  it("covers fully from inventory with 0 gold needed", () => {
    const { goldNeeded, nextWallet } = goldCostAfterInventory(
      { gold: 50, steel: 100, concrete: 0 },
      { steel: 40 },
      { steel: 2, concrete: 1 },
    );
    expect(goldNeeded).toBe(0);
    expect(nextWallet.steel).toBe(60);
  });
});

describe("waitHoursToAfford", () => {
  it("returns 0 when already affordable", () => {
    expect(waitHoursToAfford(50, 50, 1)).toBe(0);
    expect(waitHoursToAfford(40, 50, 1)).toBe(0);
  });

  it("waits for the shortfall", () => {
    expect(waitHoursToAfford(100, 40, 10)).toBeCloseTo(6);
  });

  it("is infinite when broke with no income", () => {
    expect(waitHoursToAfford(10, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
