import { equipmentSlot } from "../equipment/catalog";
import { parseSkillNumbers } from "../equipment/skills";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type ParsedInventoryItem = {
  itemCode: string;
  skills: Record<string, number>;
  slotHint: string | null;
};

type InventoryEntry = {
  value: unknown;
  keyHint: string | null;
};

const CONTAINER_KEYS = ["items", "equipment", "slots"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function inventoryEntries(raw: unknown): InventoryEntry[] {
  if (Array.isArray(raw)) {
    return raw.map((value) => ({ value, keyHint: null }));
  }

  const obj = asRecord(raw);
  if (!obj) return [];

  for (const key of CONTAINER_KEYS) {
    if (key in obj) return inventoryEntries(obj[key]);
  }

  return Object.entries(obj).map(([keyHint, value]) => ({ value, keyHint }));
}

export function parseInventoryEquipment(raw: unknown): ParsedInventoryItem[] {
  const parsed: ParsedInventoryItem[] = [];

  for (const { value, keyHint } of inventoryEntries(raw)) {
    const obj = asRecord(value);
    if (!obj) continue;
    const item = asRecord(obj.item);
    const itemCode = pickString(obj, ["itemCode", "code"]) ?? (item && pickString(item, ["code"]));
    if (!itemCode) continue;

    const skills = parseSkillNumbers(asRecord(obj.skills) ?? asRecord(item?.skills)) ?? {};
    const explicitSlot = pickString(obj, ["slot", "type"]);
    const catalogSlot = equipmentSlot(itemCode);
    const mapSlot =
      keyHint === "weapon" ||
      keyHint === "helmet" ||
      keyHint === "chest" ||
      keyHint === "gloves" ||
      keyHint === "pants" ||
      keyHint === "boots"
        ? keyHint
        : null;

    parsed.push({
      itemCode,
      skills,
      slotHint: explicitSlot ?? mapSlot ?? (catalogSlot === "other" ? null : catalogSlot),
    });
  }

  return parsed;
}

export async function fetchCurrentEquipment(
  warera: WareraRequester,
  userId: string,
): Promise<unknown> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("inventory.fetchCurrentEquipment", { userId }),
  );
  return unwrapTrpcData(json);
}
