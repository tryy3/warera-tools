import { Flame, Swords } from "lucide-react";
import type { ReactNode } from "react";
import type { BonusPart } from "../../../battle-bonus/types";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { FlagIcon } from "../../components/FlagIcon";
import type { MuFightDeskBattle } from "./types";

export type FightDeskBattleStripProps = {
  battles: MuFightDeskBattle[];
  selectedBattleId: string | "custom";
  customBonus: number;
  muAvatarUrl?: string | null;
  onSelectBattle: (id: string | "custom") => void;
  onCustomBonusChange: (fraction: number) => void;
};

function numericInputValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCompactMuDamage(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) {
    const scaled = n / 1_000_000;
    const oneDecimal = Math.round(scaled * 10) / 10;
    return `${oneDecimal}M`;
  }
  if (n >= 1_000) {
    const scaled = n / 1_000;
    const oneDecimal = Math.round(scaled * 10) / 10;
    return `${oneDecimal}K`;
  }
  return formatDisplayNumber(n, 0, { groupThousands: true });
}

const BORING_OFF_IDS = new Set([
  "patriotic",
  "alliance",
  "defensive_pact",
  "sworn_enemy",
  "military_base",
  "resistance",
]);

function formatPartPercent(amount: number): string {
  const pct = Math.round(amount * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

export function formatBonusBreakdown(parts: BonusPart[]): string {
  const tokens: string[] = [];

  for (const part of parts) {
    if (part.id === "supply_line") continue;
    if (part.status === "applied" && part.amount != null && part.amount !== 0) {
      tokens.push(`${part.label} ${formatPartPercent(part.amount)}`);
    }
  }

  const hq = parts.find((part) => part.id === "hq");
  if (hq?.status === "off") tokens.push("HQ off");

  const bunker = parts.find((part) => part.id === "bunker");
  if (bunker?.status === "off") tokens.push("bunker off");

  for (const part of parts) {
    if (part.status !== "off" || BORING_OFF_IDS.has(part.id)) continue;
    if (part.id === "hq" || part.id === "bunker" || part.id === "supply_line") continue;
    tokens.push(`${part.label.toLowerCase()} off`);
  }

  const supply = parts.find((part) => part.id === "supply_line");
  if (supply?.status !== "unknown") {
    if (supply?.status === "applied" && supply.amount != null && supply.amount < 0) {
      tokens.push("supply −25%");
    } else {
      tokens.push("supply OK");
    }
  }

  return tokens.join(" · ");
}

function flagCode(battle: MuFightDeskBattle, side: "attacker" | "defender"): string | null {
  if (side === "attacker") return battle.attackerIsoCode ?? battle.attackerCountryId;
  return battle.defenderIsoCode ?? battle.defenderCountryId;
}

function countryOrderFlagCode(battle: MuFightDeskBattle): string | null {
  if (!battle.countryOrderSide) return null;
  return battle.muCountryIsoCode;
}

function orderChipAmountPct(amount: number | null | undefined): 5 | 10 | 15 | null {
  if (amount == null) return null;
  const pct = Math.round(amount * 100);
  if (pct >= 15) return 15;
  if (pct >= 10) return 10;
  if (pct >= 5) return 5;
  return null;
}

function orderChipPriority(pct: 5 | 10 | 15): "low" | "medium" | "high" {
  if (pct === 15) return "high";
  if (pct === 10) return "medium";
  return "low";
}

function orderChipTone(pct: 5 | 10 | 15): string {
  if (pct === 15) return "border-[#a62d2f] bg-[#2e0c0d] text-[#e29596]";
  if (pct === 10) return "border-current bg-[#2e270c] text-[#e1c950]";
  return "border-current bg-[#102511] text-[#9fd06f]";
}

const ORDER_CHIP_IMAGE_CLASS =
  "h-auto w-[1em] shrink-0 rounded-[3px] object-contain shadow-[0_0_0_1px_#ffffff1f]";

function OrderTargetIcon() {
  return (
    <svg
      data-order-icon="target"
      className="size-[15px] shrink-0 fill-current [filter:drop-shadow(1px_1px_0_rgba(0,0,0,0.8))]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M3.05,13H1V11H3.05C3.5,6.83 6.83,3.5 11,3.05V1H13V3.05C17.17,3.5 20.5,6.83 20.95,11H23V13H20.95C20.5,17.17 17.17,20.5 13,20.95V23H11V20.95C6.83,20.5 3.5,17.17 3.05,13M12,5A7,7 0 0,0 5,12A7,7 0 0,0 12,19A7,7 0 0,0 19,12A7,7 0 0,0 12,5Z" />
    </svg>
  );
}

function OrderChip({
  kind,
  amount,
  children,
}: {
  kind: "mu" | "country";
  amount: number | null | undefined;
  children: ReactNode;
}) {
  const pct = orderChipAmountPct(amount);
  if (pct == null) return null;
  const priority = orderChipPriority(pct);
  const owner = kind === "mu" ? "MU" : "Country";
  return (
    <span
      data-fight-desk-order={kind}
      data-order-chip-amount={String(pct)}
      title={`${owner} ${priority}`}
      className={[
        "box-content inline-flex h-4 min-w-[42px] shrink-0 items-center justify-center gap-[3px] rounded-[6px] border border-solid px-[5px] py-0.5 leading-none shadow-[inset_0_0_0_1px_#0006,0_2px_4px_#0000004d]",
        orderChipTone(pct),
      ].join(" ")}
    >
      <OrderTargetIcon />
      {children}
    </span>
  );
}

function BattleCard({
  battle,
  selected,
  muAvatarUrl,
  onSelect,
}: {
  battle: MuFightDeskBattle;
  selected: boolean;
  muAvatarUrl: string | null;
  onSelect: () => void;
}) {
  const firePct = Math.round(battle.bonus.total * 100);
  const muCompact = formatCompactMuDamage(battle.muDamageToDate);
  const hasMuOrder = battle.kind === "mu_order" || battle.kind === "both";
  const hasCountryOrder = battle.kind === "country_order" || battle.kind === "both";
  const muOrderAmount = battle.bonus.parts.find((part) => part.id === "mu_order")?.amount;
  const countryOrderAmount = battle.bonus.parts.find((part) => part.id === "country_order")?.amount;

  return (
    <button
      type="button"
      data-fight-desk-battle-selected={selected ? "true" : "false"}
      className={[
        "relative flex min-w-[10.5rem] shrink-0 flex-col items-center gap-1.5 rounded-md border bg-secondary/80 px-3 py-2.5 pt-3 text-center transition-colors",
        selected
          ? "border-violet-400/70 ring-2 ring-violet-500/45"
          : "border-border/60 hover:border-border",
      ].join(" ")}
      onClick={onSelect}
    >
      {hasMuOrder || hasCountryOrder ? (
        <div className="absolute -top-[9px] right-2 z-10 inline-flex items-center gap-1">
          {hasMuOrder ? (
            <OrderChip kind="mu" amount={muOrderAmount}>
              {muAvatarUrl ? (
                <img
                  src={muAvatarUrl}
                  alt=""
                  className={ORDER_CHIP_IMAGE_CLASS}
                  draggable={false}
                />
              ) : (
                <span className="text-[0.55rem] font-bold text-foreground">MU</span>
              )}
            </OrderChip>
          ) : null}
          {hasCountryOrder ? (
            <OrderChip kind="country" amount={countryOrderAmount}>
              <FlagIcon code={countryOrderFlagCode(battle)} className={ORDER_CHIP_IMAGE_CLASS} />
            </OrderChip>
          ) : null}
        </div>
      ) : null}
      <div className="w-full truncate px-5 text-xs font-semibold text-foreground">
        {battle.regionName ?? "Battle"}
      </div>
      <div className="flex items-center justify-center gap-2">
        <FlagIcon code={flagCode(battle, "attacker")} className="h-6 w-8 rounded-sm object-cover" />
        {battle.isRevolt ? (
          <span className="text-lg leading-none" aria-hidden="true">
            ✊
          </span>
        ) : (
          <Swords className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
        <FlagIcon code={flagCode(battle, "defender")} className="h-6 w-8 rounded-sm object-cover" />
      </div>
      <div className="flex w-full items-center justify-center gap-3 font-mono text-xs tabular-nums">
        <span className="inline-flex items-center gap-0.5 font-semibold text-orange-400">
          <Flame className="size-3.5" aria-hidden="true" />+{firePct}%
        </span>
        <span className="text-muted-foreground">MU {muCompact === "—" ? "—" : muCompact}</span>
      </div>
    </button>
  );
}

function CustomCard({
  selected,
  customBonus,
  onSelect,
  onCustomBonusChange,
}: {
  selected: boolean;
  customBonus: number;
  onSelect: () => void;
  onCustomBonusChange: (fraction: number) => void;
}) {
  return (
    <div
      data-fight-desk-battle-selected={selected ? "true" : "false"}
      className={[
        "flex min-w-[10.5rem] shrink-0 flex-col items-center gap-1.5 rounded-md border bg-secondary/80 px-3 py-2.5 text-center",
        selected ? "border-violet-400/70 ring-2 ring-violet-500/45" : "border-border/60",
      ].join(" ")}
    >
      <button type="button" className="flex w-full flex-col items-center" onClick={onSelect}>
        <div className="text-xs font-semibold text-foreground">Custom</div>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="h-6 w-8 rounded-sm border border-dashed border-border/80 bg-background/20" />
          <Swords className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="h-6 w-8 rounded-sm border border-dashed border-border/80 bg-background/20" />
        </div>
        <p className="mt-1 text-[0.65rem] text-muted-foreground">Typed bonus, no battle</p>
      </button>
      <label className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        Fire
        <input
          type="number"
          min="0"
          step="1"
          className="h-7 w-16 rounded-lg border border-input bg-background px-2 text-center font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={customBonus * 100}
          onChange={(event) => onCustomBonusChange(numericInputValue(event.target.value) / 100)}
          onFocus={onSelect}
        />
        %
      </label>
    </div>
  );
}

export function FightDeskBattleStrip({
  battles,
  selectedBattleId,
  customBonus,
  muAvatarUrl = null,
  onSelectBattle,
  onCustomBonusChange,
}: FightDeskBattleStripProps) {
  const selectedBattle =
    selectedBattleId === "custom"
      ? null
      : (battles.find((battle) => battle.id === selectedBattleId) ?? null);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Battle bonus
      </div>
      <div className="flex gap-2 overflow-x-auto pt-2.5 pb-1">
        <CustomCard
          selected={selectedBattleId === "custom"}
          customBonus={customBonus}
          onSelect={() => onSelectBattle("custom")}
          onCustomBonusChange={(fraction) => {
            onSelectBattle("custom");
            onCustomBonusChange(fraction);
          }}
        />
        {battles.map((battle) => (
          <BattleCard
            key={battle.id}
            battle={battle}
            selected={selectedBattleId === battle.id}
            muAvatarUrl={muAvatarUrl}
            onSelect={() => onSelectBattle(battle.id)}
          />
        ))}
      </div>
      {selectedBattle ? (
        <p className="text-xs text-muted-foreground">
          {formatBonusBreakdown(selectedBattle.bonus.parts)}
        </p>
      ) : null}
    </div>
  );
}
