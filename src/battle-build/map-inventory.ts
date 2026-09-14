import { equipmentSlot } from "../equipment/catalog";
import type { ParsedInventoryItem } from "../warera/inventory";
import { AMMO_CODES, emptyLoadout, FOOD_CODES, type Loadout, type LoadoutSlotId } from "./slots";

const AMMO_CODE_SET = new Set<string>(AMMO_CODES);
const FOOD_CODE_SET = new Set<string>(FOOD_CODES);
const GEAR_SLOTS = new Set<LoadoutSlotId>([
  "weapon",
  "helmet",
  "chest",
  "gloves",
  "pants",
  "boots",
]);

function resolveSlot(item: ParsedInventoryItem): LoadoutSlotId | null {
  if (AMMO_CODE_SET.has(item.itemCode)) return "ammo";
  if (FOOD_CODE_SET.has(item.itemCode)) return "food";

  if (item.slotHint && GEAR_SLOTS.has(item.slotHint as LoadoutSlotId)) {
    return item.slotHint as LoadoutSlotId;
  }

  const catalogSlot = equipmentSlot(item.itemCode);
  return catalogSlot === "other" ? null : catalogSlot;
}

export function mapInventoryToLoadout(items: ParsedInventoryItem[]): {
  loadout: Loadout;
  warnings: string[];
} {
  const loadout = emptyLoadout();
  const warnings: string[] = [];

  for (const item of items) {
    const slot = resolveSlot(item);
    if (!slot) {
      warnings.push(`Could not map inventory item ${item.itemCode} to a loadout slot`);
      continue;
    }
    if (loadout[slot]) {
      warnings.push(`Ignored extra inventory item ${item.itemCode} for occupied ${slot} slot`);
      continue;
    }
    loadout[slot] = { itemCode: item.itemCode, skills: item.skills };
  }

  return { loadout, warnings };
}
