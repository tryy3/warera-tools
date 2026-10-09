import type { GearTierId } from "@/calculator";
import { EQUIPMENT_TIER_SHORT_LABEL, formatEquipmentItem } from "@/equipment/catalog";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";

export function lootLabel(tier: GearTierId, code: string): string {
  return `${EQUIPMENT_TIER_SHORT_LABEL[tier]} ${formatEquipmentItem(code)}`;
}

export function formatDamageNeeded(n: number): string {
  if (n <= 0) return "next tick";
  return `+${formatDisplayNumber(n, 0, { groupThousands: true })}`;
}

export function formatDamage(n: number): string {
  return formatDisplayNumber(n, 0, { groupThousands: true });
}

/** m:ss until the next round tick; "ticking" once the server time has passed. */
export function formatTickCountdown(nextTickAt: string | null, nowMs: number): string {
  if (nextTickAt == null) return "—";
  const ms = Date.parse(nextTickAt) - nowMs;
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "ticking";
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
