import type { GearTierId } from "@/calculator";
import { cn } from "@/lib/utils";
import { equipmentMediaCode } from "@/equipment/catalog";
import { ItemIcon } from "./ItemIcon";

type Props = {
  itemCode: string;
  tier: GearTierId | null;
  className?: string;
  iconClassName?: string;
};

/** Calculator-style tier gradient tile with the item art on top. */
export function GearItemIcon({ itemCode, tier, className, iconClassName }: Props) {
  const mediaCode = equipmentMediaCode(itemCode);
  return (
    <span
      className={cn(
        "gear-item-icon",
        tier != null ? `tier-tile--${tier}` : "gear-item-icon--unknown",
        className,
      )}
    >
      <ItemIcon itemCode={mediaCode} className={cn("gear-item-icon-img", iconClassName)} />
    </span>
  );
}
