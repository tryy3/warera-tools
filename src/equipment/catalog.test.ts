import { describe, expect, it } from "vite-plus/test";
import {
  compareEquipmentItems,
  equipmentMediaCode,
  equipmentSlot,
  equipmentTierShortLabel,
  formatEquipmentItem,
  tierFromItemCode,
} from "./catalog";

describe("tierFromItemCode", () => {
  it("maps trailing 1–6 to gray…red", () => {
    expect(tierFromItemCode("chest1")).toBe("gray");
    expect(tierFromItemCode("helmet4")).toBe("purple");
    expect(tierFromItemCode("boots6")).toBe("red");
  });

  it("maps weapons by code", () => {
    expect(tierFromItemCode("knife")).toBe("gray");
    expect(tierFromItemCode("gun")).toBe("green");
    expect(tierFromItemCode("rifle")).toBe("blue");
    expect(tierFromItemCode("sniper")).toBe("purple");
    expect(tierFromItemCode("tank")).toBe("yellow");
    expect(tierFromItemCode("jet")).toBe("red");
    expect(tierFromItemCode("Tank")).toBe("yellow");
  });

  it("returns null for unknown / bad suffix", () => {
    expect(tierFromItemCode("chest0")).toBeNull();
    expect(tierFromItemCode("chest7")).toBeNull();
    expect(tierFromItemCode("")).toBeNull();
    expect(tierFromItemCode("unknownWeapon")).toBeNull();
  });
});

describe("equipmentMediaCode + formatEquipmentItem", () => {
  it("strips tier digit for armor media and labels", () => {
    expect(equipmentMediaCode("boots6")).toBe("boots");
    expect(equipmentMediaCode("chest4")).toBe("chest");
    expect(formatEquipmentItem("boots6")).toBe("Boots");
    expect(formatEquipmentItem("helmet1")).toBe("Helmet");
  });

  it("keeps weapon codes as media names", () => {
    expect(equipmentMediaCode("jet")).toBe("jet");
    expect(formatEquipmentItem("sniper")).toBe("Sniper");
  });
});

describe("equipmentSlot + compareEquipmentItems", () => {
  it("orders Weapon → Helmet → Chest → Gloves → Pants → Boots", () => {
    const codes = ["boots4", "chest4", "jet", "pants4", "helmet4", "gloves4"];
    const sorted = [...codes].sort(compareEquipmentItems);
    expect(sorted).toEqual(["jet", "helmet4", "chest4", "gloves4", "pants4", "boots4"]);
  });

  it("classifies slots", () => {
    expect(equipmentSlot("jet")).toBe("weapon");
    expect(equipmentSlot("helmet3")).toBe("helmet");
    expect(equipmentSlot("mystery")).toBe("other");
  });
});

describe("equipmentTierShortLabel", () => {
  it("uses Mythic…Basic names", () => {
    expect(equipmentTierShortLabel("red")).toBe("Mythic");
    expect(equipmentTierShortLabel("gray")).toBe("Basic");
    expect(equipmentTierShortLabel(null)).toBe("Unknown");
  });
});
