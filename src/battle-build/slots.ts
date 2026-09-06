import { ITEM_CODE_TIER_OVERRIDES } from "../equipment/catalog";

export type LoadoutSlotId =
  | "weapon"
  | "helmet"
  | "chest"
  | "gloves"
  | "pants"
  | "boots"
  | "ammo"
  | "food";

export const LOADOUT_SLOT_ORDER: LoadoutSlotId[] = [
  "weapon",
  "helmet",
  "chest",
  "gloves",
  "pants",
  "boots",
  "ammo",
  "food",
];

export type LoadoutItem = { itemCode: string; skills: Record<string, number> };

export type Loadout = Record<LoadoutSlotId, LoadoutItem | null>;

export function emptyLoadout(): Loadout {
  return Object.fromEntries(LOADOUT_SLOT_ORDER.map((slot) => [slot, null])) as Loadout;
}

export const AMMO_CODES = ["lightAmmo", "ammo", "heavyAmmo"] as const;

export const FOOD_CODES = ["bread", "steak", "cookedFish"] as const;

export function cycleCodes(codes: readonly string[], current: string | null, dir: 1 | -1): string {
  if (codes.length === 0) {
    throw new RangeError("cycleCodes requires at least one code");
  }

  const index =
    current == null ? (dir === 1 ? -1 : codes.length) : codes.indexOf(current);
  const start = index < 0 ? (dir === 1 ? -1 : codes.length) : index;
  const next = (start + dir + codes.length) % codes.length;
  return codes[next]!;
}

export function gearCodesForSlot(
  slot: Exclude<LoadoutSlotId, "ammo" | "food">,
): string[] {
  if (slot === "weapon") {
    return Object.keys(ITEM_CODE_TIER_OVERRIDES);
  }

  return Array.from({ length: 6 }, (_, i) => `${slot}${i + 1}`);
}
