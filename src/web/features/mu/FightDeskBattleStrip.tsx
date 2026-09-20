import { Swords } from "lucide-react";
import type { BonusPart } from "../../../battle-bonus/types";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { FlagIcon } from "../../components/FlagIcon";
import type { MuFightDeskBattle } from "./types";

export type FightDeskBattleStripProps = {
  battles: MuFightDeskBattle[];
  selectedBattleId: string | "custom";
  customBonus: number;
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
  if (
    supply?.status === "applied" &&
    supply.amount != null &&
    supply.amount < 0
  ) {
    tokens.push("supply −25%");
  } else {
    tokens.push("supply OK");
  }

  return tokens.join(" · ");
}

function flagCode(battle: MuFightDeskBattle, side: "attacker" | "defender"): string | null {
  if (side === "attacker") return battle.attackerIsoCode ?? battle.attackerCountryId;
  return battle.defenderIsoCode ?? battle.defenderCountryId;
}

function countryOrderFlagCode(battle: MuFightDeskBattle): string | null {
  if (!battle.countryOrderSide) return null;
  return flagCode(battle, battle.countryOrderSide);
}

function BattleCard({
  battle,
  selected,
  onSelect,
}: {
  battle: MuFightDeskBattle;
  selected: boolean;
  onSelect: () => void;
}) {
  const firePct = Math.round(battle.bonus.total * 100);
  const muCompact = formatCompactMuDamage(battle.muDamageToDate);

  return (
    <button
      type="button"
      data-fight-desk-battle-selected={selected ? "true" : "false"}
      className={[
        "flex min-w-[9.5rem] shrink-0 flex-col gap-1.5 rounded-md border bg-secondary/80 px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-violet-400/70 ring-2 ring-violet-500/45"
          : "border-border/60 hover:border-border",
      ].join(" ")}
      onClick={onSelect}
    >
      <div className="truncate text-xs font-semibold text-foreground">{battle.regionName ?? "Battle"}</div>
      <div className="flex items-center gap-1.5">
        <FlagIcon code={flagCode(battle, "attacker")} className="h-4 w-5 rounded-sm object-cover" />
        {battle.isRevolt ? (
          <span className="text-sm" aria-hidden="true">
            ✊
          </span>
        ) : (
          <Swords className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
        <FlagIcon code={flagCode(battle, "defender")} className="h-4 w-5 rounded-sm object-cover" />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {battle.kind === "mu_order" || battle.kind === "both" ? (
          <span className="rounded border border-border/70 bg-background/50 px-1 py-px text-[0.6rem] font-bold tracking-wide text-muted-foreground uppercase">
            MU
          </span>
        ) : null}
        {battle.kind === "country_order" || battle.kind === "both" ? (
          <FlagIcon
            code={countryOrderFlagCode(battle)}
            className="h-3.5 w-4 rounded-sm object-cover"
          />
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
        <span className="font-semibold text-amber-300">+{firePct}%</span>
        <span className="text-muted-foreground">
          MU {muCompact === "—" ? "—" : muCompact}
        </span>
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
        "flex min-w-[9.5rem] shrink-0 flex-col gap-1.5 rounded-md border bg-secondary/80 px-3 py-2.5",
        selected
          ? "border-violet-400/70 ring-2 ring-violet-500/45"
          : "border-border/60",
      ].join(" ")}
    >
      <button type="button" className="text-left" onClick={onSelect}>
        <div className="text-xs font-semibold text-foreground">Custom</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-4 w-5 rounded-sm border border-dashed border-border/80 bg-background/20" />
          <Swords className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="h-4 w-5 rounded-sm border border-dashed border-border/80 bg-background/20" />
        </div>
        <p className="mt-1 text-[0.65rem] text-muted-foreground">Typed bonus, no battle</p>
      </button>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Fire
        <input
          type="number"
          min="0"
          step="1"
          className="h-7 w-16 rounded-lg border border-input bg-background px-2 font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={customBonus * 100}
          onChange={(event) =>
            onCustomBonusChange(numericInputValue(event.target.value) / 100)
          }
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
      <div className="flex gap-2 overflow-x-auto pb-1">
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
            onSelect={() => onSelectBattle(battle.id)}
          />
        ))}
      </div>
      {selectedBattle ? (
        <p className="text-xs text-muted-foreground">{formatBonusBreakdown(selectedBattle.bonus.parts)}</p>
      ) : null}
    </div>
  );
}
