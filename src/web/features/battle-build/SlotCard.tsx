import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AMMO_CODES,
  cycleCodes,
  FOOD_CODES,
  gearCodesForSlot,
  type LoadoutItem,
  type LoadoutSlotId,
} from "@/battle-build/slots";
import type { QuoteLineResult } from "@/battle-build/quote";
import { formatEquipmentItem, tierFromItemCode } from "@/equipment/catalog";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GearItemIcon } from "../../components/GearItemIcon";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { createLoadoutItem } from "./useLoadoutQuotes";

const SLOT_LABELS: Record<LoadoutSlotId, string> = {
  weapon: "Weapon",
  helmet: "Helmet",
  chest: "Chest",
  gloves: "Gloves",
  pants: "Pants",
  boots: "Boots",
  ammo: "Ammo",
  food: "Food",
};

function codesForSlot(slot: LoadoutSlotId): readonly string[] {
  if (slot === "ammo") return AMMO_CODES;
  if (slot === "food") return FOOD_CODES;
  return gearCodesForSlot(slot);
}

function itemLabel(itemCode: string): string {
  return formatEquipmentItem(itemCode).replace(/([a-z])([A-Z])/g, "$1 $2");
}

function skillLabel(skill: string): string {
  return skill.replace(/([a-z])([A-Z])/g, "$1 $2");
}

type SlotCardProps = {
  slot: LoadoutSlotId;
  item: LoadoutItem | null;
  quote: QuoteLineResult | null;
  quotePending: boolean;
  onChange: (item: LoadoutItem | null) => void;
};

export function SlotCard({ slot, item, quote, quotePending, onChange }: SlotCardProps) {
  const codes = codesForSlot(slot);

  function cycle(dir: 1 | -1) {
    const itemCode = cycleCodes(codes, item?.itemCode ?? null, dir);
    onChange(createLoadoutItem(slot, itemCode));
  }

  function changeSkill(skill: string, delta: 1 | -1) {
    if (!item) return;
    onChange({
      ...item,
      skills: {
        ...item.skills,
        [skill]: Math.max(0, (item.skills[skill] ?? 0) + delta),
      },
    });
  }

  const isSupply = slot === "ammo" || slot === "food";

  return (
    <article className="flex min-h-48 flex-col rounded-xl border border-border/80 bg-secondary/20 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="m-0 text-[0.7rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {SLOT_LABELS[slot]}
        </p>
        {item ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Clear ${SLOT_LABELS[slot]}`}
            onClick={() => onChange(null)}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-12 items-center gap-2.5">
        {item ? (
          <>
            {isSupply ? (
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-background/70">
                <ItemIcon itemCode={item.itemCode} className="size-9 object-contain" />
              </span>
            ) : (
              <GearItemIcon
                itemCode={item.itemCode}
                tier={tierFromItemCode(item.itemCode)}
                className="gear-item-icon--lg"
              />
            )}
            <strong className="min-w-0 truncate text-sm">{itemLabel(item.itemCode)}</strong>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Empty</span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={`Previous ${SLOT_LABELS[slot]} item`}
          onClick={() => cycle(-1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="text-[0.68rem] tracking-wide text-muted-foreground uppercase">
          Select item
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={`Next ${SLOT_LABELS[slot]} item`}
          onClick={() => cycle(1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

      {item && Object.keys(item.skills).length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
          {Object.entries(item.skills).map(([skill, value]) => (
            <div key={skill} className="flex items-center justify-between gap-2">
              <span className="truncate text-xs capitalize text-muted-foreground">
                {skillLabel(skill)}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label={`Decrease ${skillLabel(skill)}`}
                  disabled={value <= 0}
                  onClick={() => changeSkill(skill, -1)}
                >
                  <Minus aria-hidden />
                </Button>
                <span className="w-8 text-center font-mono text-xs tabular-nums">{value}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label={`Increase ${skillLabel(skill)}`}
                  onClick={() => changeSkill(skill, 1)}
                >
                  <Plus aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {item ? (
        <div className="mt-auto border-t border-border/70 pt-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Median (tax incl.)</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              {quotePending ? (
                <span className="text-muted-foreground">Pricing…</span>
              ) : quote?.median == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  <GoldIcon />
                  {formatDisplayNumber(quote.median)}
                </>
              )}
            </span>
          </div>
          {!quotePending && quote ? (
            <p className="mt-1 mb-0 text-[0.68rem] text-muted-foreground">
              {quote.window} · {quote.trades} {quote.trades === 1 ? "trade" : "trades"}
              {quote.widened ? (
                <span className="ml-1.5 rounded border border-primary/30 bg-primary/10 px-1 py-0.5 text-primary">
                  ±1
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
