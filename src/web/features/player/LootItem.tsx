import type { GearTierId } from "@/calculator";
import { EQUIPMENT_TIER_SHORT_LABEL } from "@/equipment/catalog";
import { GearItemIcon } from "../../components/GearItemIcon";
import { lootLabel } from "./lootFormat";

type Props = {
  tier: GearTierId;
  code: string;
  count?: number;
};

export function LootItem({ tier, code, count }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={EQUIPMENT_TIER_SHORT_LABEL[tier]}
      data-loot-tier={tier}
    >
      <GearItemIcon itemCode={code} tier={tier} />
      <span className="text-sm">{lootLabel(tier, code)}</span>
      {count != null && count > 1 ? (
        <span className="font-mono text-xs text-muted-foreground">×{count}</span>
      ) : null}
    </span>
  );
}
