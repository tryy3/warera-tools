import type { GearTierId } from "../calculator";

const SUFFIX_TIERS: GearTierId[] = ["gray", "green", "blue", "purple", "yellow", "red"];

/** Weapons have no tier digit — map by item code. */
export const ITEM_CODE_TIER_OVERRIDES: Record<string, GearTierId> = {
  knife: "gray",
  gun: "green",
  rifle: "blue",
  sniper: "purple",
  tank: "yellow",
  jet: "red",
};

const WEAPON_CODES = new Set(Object.keys(ITEM_CODE_TIER_OVERRIDES));

/** Display order on Equipment Market: Mythic → Basic. */
export const EQUIPMENT_TIER_DISPLAY_ORDER: readonly GearTierId[] = [
  "red",
  "yellow",
  "purple",
  "blue",
  "green",
  "gray",
] as const;

export const EQUIPMENT_TIER_SHORT_LABEL: Record<GearTierId, string> = {
  gray: "Basic",
  green: "Reinforced",
  blue: "Advanced",
  purple: "Elite",
  yellow: "Legendary",
  red: "Mythic",
};

export type EquipmentSlot = "weapon" | "helmet" | "chest" | "gloves" | "pants" | "boots" | "other";

const SLOT_ORDER: readonly EquipmentSlot[] = [
  "weapon",
  "helmet",
  "chest",
  "gloves",
  "pants",
  "boots",
  "other",
] as const;

export function tierFromItemCode(itemCode: string): GearTierId | null {
  const code = itemCode.trim().toLowerCase();
  if (!code) return null;
  const overridden = ITEM_CODE_TIER_OVERRIDES[code];
  if (overridden) return overridden;
  const m = /(\d)$/.exec(code);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 6) return null;
  return SUFFIX_TIERS[n - 1]!;
}

/** WarEra media filename stem (no `.png`) — armor uses base name, weapons use code. */
export function equipmentMediaCode(itemCode: string): string {
  const code = itemCode.trim().toLowerCase();
  if (!code) return code;
  if (WEAPON_CODES.has(code)) return code;
  const m = /^(.*\D)(\d)$/.exec(code);
  if (m?.[1]) return m[1];
  return code;
}

export function formatEquipmentItem(itemCode: string): string {
  const media = equipmentMediaCode(itemCode);
  if (!media) return itemCode;
  return media.replace(/^./, (c) => c.toUpperCase());
}

export function equipmentSlot(itemCode: string): EquipmentSlot {
  const code = itemCode.trim().toLowerCase();
  if (WEAPON_CODES.has(code)) return "weapon";
  const base = equipmentMediaCode(code);
  if (
    base === "helmet" ||
    base === "chest" ||
    base === "gloves" ||
    base === "pants" ||
    base === "boots"
  ) {
    return base;
  }
  return "other";
}

export function compareEquipmentItems(aCode: string, bCode: string): number {
  const sa = SLOT_ORDER.indexOf(equipmentSlot(aCode));
  const sb = SLOT_ORDER.indexOf(equipmentSlot(bCode));
  if (sa !== sb) return sa - sb;
  return aCode.localeCompare(bCode);
}

export function equipmentTierShortLabel(tier: GearTierId | null): string {
  if (tier == null) return "Unknown";
  return EQUIPMENT_TIER_SHORT_LABEL[tier];
}
