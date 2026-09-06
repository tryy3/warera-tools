import { describe, expect, it } from "vite-plus/test";
import {
  AMMO_CODES,
  FOOD_CODES,
  LOADOUT_SLOT_ORDER,
  cycleCodes,
  emptyLoadout,
  gearCodesForSlot,
} from "./slots";

describe("emptyLoadout", () => {
  it("initializes every slot to null", () => {
    const loadout = emptyLoadout();
    for (const slot of LOADOUT_SLOT_ORDER) {
      expect(loadout[slot]).toBeNull();
    }
  });
});

describe("cycleCodes", () => {
  const codes = ["a", "b", "c"] as const;

  it("starts from the ends when current is null", () => {
    expect(cycleCodes(codes, null, 1)).toBe("a");
    expect(cycleCodes(codes, null, -1)).toBe("c");
  });

  it("steps forward and backward with wrap", () => {
    expect(cycleCodes(codes, "a", 1)).toBe("b");
    expect(cycleCodes(codes, "c", 1)).toBe("a");
    expect(cycleCodes(codes, "a", -1)).toBe("c");
  });
});

describe("gearCodesForSlot", () => {
  it("includes weapon codes from the equipment catalog", () => {
    expect(gearCodesForSlot("weapon")).toContain("sniper");
  });

  it("includes tiered armor codes for armor slots", () => {
    expect(gearCodesForSlot("helmet")).toContain("helmet6");
  });
});

describe("consumable catalogs", () => {
  it("defines ammo and food code lists", () => {
    expect(AMMO_CODES).toEqual(["lightAmmo", "ammo", "heavyAmmo"]);
    expect(FOOD_CODES).toEqual(["bread", "steak", "cookedFish"]);
  });
});
