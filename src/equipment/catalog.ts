import type { GearTierId } from "../calculator";

const SUFFIX_TIERS: GearTierId[] = ["gray", "green", "blue", "purple", "yellow", "red"];

/** Explicit tiers for itemCodes without a 1–6 suffix. Extend as codes are confirmed. */
export const ITEM_CODE_TIER_OVERRIDES: Record<string, GearTierId> = {
  // e.g. sniper: "yellow" once confirmed from live data / wiki
};

export function tierFromItemCode(itemCode: string): GearTierId | null {
  const code = itemCode.trim();
  if (!code) return null;
  const overridden = ITEM_CODE_TIER_OVERRIDES[code];
  if (overridden) return overridden;
  const m = /(\d)$/.exec(code);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 6) return null;
  return SUFFIX_TIERS[n - 1]!;
}

export function formatEquipmentItem(itemCode: string): string {
  return itemCode.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
