import { describe, expect, it } from "vite-plus/test";
import type { ParsedInventoryItem } from "../warera/inventory";
import { mapInventoryToLoadout } from "./map-inventory";

describe("mapInventoryToLoadout", () => {
  it("maps gear, ammo, and food to loadout slots", () => {
    const items: ParsedInventoryItem[] = [
      { itemCode: "sniper", skills: { attack: 103 }, slotHint: "weapon" },
      { itemCode: "helmet4", skills: { armor: 22 }, slotHint: "helmet" },
      { itemCode: "heavyAmmo", skills: {}, slotHint: null },
      { itemCode: "steak", skills: {}, slotHint: null },
    ];

    const result = mapInventoryToLoadout(items);

    expect(result.loadout.weapon).toEqual({ itemCode: "sniper", skills: { attack: 103 } });
    expect(result.loadout.helmet).toEqual({ itemCode: "helmet4", skills: { armor: 22 } });
    expect(result.loadout.ammo).toEqual({ itemCode: "heavyAmmo", skills: {} });
    expect(result.loadout.food).toEqual({ itemCode: "steak", skills: {} });
    expect(result.warnings).toEqual([]);
  });

  it("keeps the first item per slot and warns about extras", () => {
    const result = mapInventoryToLoadout([
      { itemCode: "gun", skills: { attack: 20 }, slotHint: null },
      { itemCode: "rifle", skills: { attack: 50 }, slotHint: "weapon" },
    ]);

    expect(result.loadout.weapon?.itemCode).toBe("gun");
    expect(result.warnings).toEqual([expect.stringContaining("rifle")]);
  });

  it("soft-maps unknown items to warnings and leaves the loadout empty", () => {
    const result = mapInventoryToLoadout([
      { itemCode: "mysteryBox", skills: { luck: 1 }, slotHint: "accessory" },
    ]);

    expect(Object.values(result.loadout).every((item) => item === null)).toBe(true);
    expect(result.warnings).toEqual([expect.stringContaining("mysteryBox")]);
  });
});
