import type { GearTierId } from "../calculator";
import {
  EQUIPMENT_TIER_DISPLAY_ORDER,
  equipmentSlot,
  tierFromItemCode,
  type EquipmentSlot,
} from "../equipment/catalog";

/** One row of a battleRanking page. `itemCode` is the pre-rolled prize attached to the rank slot. */
export type RankedLootRow = {
  rank: number;
  userId: string | null;
  value: number;
  itemCode: string | null;
};

export type LootSlot = {
  rank: number;
  holderUserId: string | null;
  damage: number;
  tier: GearTierId;
  kind: EquipmentSlot;
  code: string;
};

export type UpgradeTarget = LootSlot & {
  /** Extra damage to strictly pass the holder; 0 when live damage already exceeds the stale ranking value. */
  damageNeeded: number;
};

export type LootLadder = {
  myRank: number | null;
  /** The prize on the rank slot the user holds, null when unranked or the slot carries no item. */
  current: LootSlot | null;
  /** Item slots above the user, cheapest first. */
  targets: UpgradeTarget[];
  /** Cheapest target with a strictly higher tier than `current` (any target when `current` is null). */
  nextTier: UpgradeTarget | null;
  /** Targets of the same or better tier whose type differs from `current`. Empty without a current item. */
  otherTypes: UpgradeTarget[];
};

/** `code` is the first item seen for the tier and type; it only picks the icon. */
export type LootTallyKey = { tier: GearTierId; kind: EquipmentSlot; code: string };
export type LootTallyEntry = LootTallyKey & { count: number };

const TIER_ORDER = [...EQUIPMENT_TIER_DISPLAY_ORDER].reverse();

export function tierRank(tier: GearTierId): number {
  return TIER_ORDER.indexOf(tier);
}

function toSlot(row: RankedLootRow): LootSlot | null {
  if (row.itemCode == null) return null;
  const tier = tierFromItemCode(row.itemCode);
  if (tier == null) return null;
  return {
    rank: row.rank,
    holderUserId: row.userId,
    damage: row.value,
    tier,
    kind: equipmentSlot(row.itemCode),
    code: row.itemCode,
  };
}

export function buildLootLadder(
  rows: readonly RankedLootRow[],
  myUserId: string,
  myDamage: number,
): LootLadder {
  const mine = rows.find((r) => r.userId === myUserId) ?? null;
  const myRank = mine?.rank ?? null;
  const current = mine ? toSlot(mine) : null;

  const targets: UpgradeTarget[] = [];
  for (const r of rows) {
    if (myRank != null && r.rank >= myRank) continue;
    const slot = toSlot(r);
    if (!slot) continue;
    targets.push({ ...slot, damageNeeded: Math.max(0, slot.damage - myDamage + 1) });
  }
  // Equal cost: prefer the lower slot, it is the one you reach first.
  targets.sort((a, b) => a.damageNeeded - b.damageNeeded || b.rank - a.rank);

  const currentTier = current ? tierRank(current.tier) : -1;
  const nextTier = targets.find((t) => tierRank(t.tier) > currentTier) ?? null;
  const otherTypes = current
    ? targets.filter((t) => t.kind !== current.kind && tierRank(t.tier) >= currentTier)
    : [];

  return { myRank, current, targets, nextTier, otherTypes };
}

export function tallyLoot(items: readonly LootTallyKey[]): LootTallyEntry[] {
  const counts = new Map<string, LootTallyEntry>();
  for (const { tier, kind, code } of items) {
    const key = `${tier}:${kind}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { tier, kind, code, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => tierRank(b.tier) - tierRank(a.tier) || b.count - a.count,
  );
}
