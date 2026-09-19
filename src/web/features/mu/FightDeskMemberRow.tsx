import { ChevronDown, Factory, Pill, Swords } from "lucide-react";
import { classifyBuildFromSkillLevels } from "../../../build-class/classify";
import type { FightPlayerInput } from "../../../fight-damage/types";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import type { FightDeskMemberRowData } from "./fightDeskMemberRows";

function formatNumber(value: number | null, digits = 0): string {
  return value == null || !Number.isFinite(value) ? "—" : formatDisplayNumber(value, digits);
}

function formatPercent(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : `${formatDisplayNumber(value * 100, 1)}%`;
}

function formatRemaining(endsAt: string | Date | null, nowMs: number): string | null {
  if (endsAt == null) return null;
  const remainingMs = new Date(endsAt).getTime() - nowMs;
  if (!Number.isFinite(remainingMs)) return null;
  if (remainingMs <= 0) return "ended";
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function PillStatusLine({
  fight,
  pillEndsAt,
  nowMs,
}: {
  fight: FightPlayerInput | null;
  pillEndsAt: string | null;
  nowMs: number;
}) {
  if (!fight) return <span className="text-xs text-muted-foreground">Unavailable</span>;
  const timer = formatRemaining(pillEndsAt, nowMs);
  if (fight.pillStatus === "ready") {
    return <span className="text-xs text-muted-foreground">Ready</span>;
  }
  if (fight.pillStatus === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <Pill className="size-3.5" aria-hidden="true" />
        {timer ?? "Active"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
      <Pill className="size-3.5" aria-hidden="true" />
      {timer ?? "Debuff"}
    </span>
  );
}

function ResourceBar({
  label,
  value,
  max,
  colorClass,
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="min-w-24">
      <div className="mb-1 flex justify-between gap-2 text-[0.65rem] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">
          {formatDisplayNumber(value, 0)}/{formatDisplayNumber(max, 0)}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
      >
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-background/35 px-3 py-2">
      <dt className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 mb-0 font-mono text-sm tabular-nums ${
          accent ? "text-amber-200" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function FightDeskMemberRow({
  row,
  rank,
  selected,
  expanded,
  nowMs,
  onSelectedChange,
  onExpandedChange,
}: {
  row: FightDeskMemberRowData;
  rank: number;
  selected: boolean;
  expanded: boolean;
  nowMs: number;
  onSelectedChange: (selected: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { member, projected } = row;
  const fight = member.fight;
  const complete = !member.incomplete && fight != null;
  const skillEntries = Object.fromEntries(
    Object.entries(member.display.skillLevels).map(([id, level]) => [id, { level }]),
  );
  const buildClass = classifyBuildFromSkillLevels(skillEntries);
  const pillTimer = formatRemaining(member.display.pillEndsAt, nowMs);
  const pillText = !fight
    ? "Unavailable"
    : fight.pillStatus === "ready"
      ? "Ready"
      : (pillTimer ?? (fight.pillStatus === "active" ? "Active" : "Debuff"));

  return (
    <article className="border-b border-border/55 last:border-b-0">
      <div className="grid grid-cols-[auto_2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-3 py-3 xl:grid-cols-[auto_2rem_minmax(10rem,1fr)_minmax(11rem,1fr)_minmax(8rem,auto)_auto]">
        <input
          type="checkbox"
          className="size-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Select ${member.username ?? member.userId}`}
          checked={complete && selected}
          disabled={!complete}
          onChange={(event) => onSelectedChange(event.target.checked)}
        />

        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(rank).padStart(2, "0")}
        </span>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              L{member.level == null ? "—" : formatDisplayNumber(member.level, 0)}
            </span>
            <span className="truncate text-sm font-semibold">
              {member.username ?? member.userId}
            </span>
            {buildClass === "war" ? (
              <Swords className="size-3.5 shrink-0 text-amber-200" aria-label="War build" />
            ) : buildClass === "eco" ? (
              <Factory className="size-3.5 shrink-0 text-cyan-300" aria-label="Economy build" />
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {member.incomplete ? (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.65rem] text-amber-200 uppercase">
                Incomplete
              </span>
            ) : null}
            {member.refreshFailed ? (
              <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[0.65rem] text-red-300 uppercase">
                Refresh failed
              </span>
            ) : null}
            {member.role ? (
              <span className="text-[0.65rem] text-muted-foreground">{member.role}</span>
            ) : null}
          </div>
        </div>

        <div className="col-span-4 flex flex-col gap-2 xl:col-span-1">
          {fight && projected ? (
            <>
              <ResourceBar
                label="HP"
                value={projected.hp}
                max={fight.maxHp}
                colorClass="bg-red-500"
              />
              <ResourceBar
                label="Hunger"
                value={projected.hunger}
                max={fight.maxHunger}
                colorClass="bg-emerald-500"
              />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Fight snapshot unavailable</span>
          )}
        </div>

        <div className="col-span-3 xl:col-span-1 xl:text-right">
          <div className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Now
          </div>
          <div className="font-mono text-sm font-semibold text-amber-100 tabular-nums">
            {formatNumber(row.nowDamage)}
          </div>
          {row.peakDamage != null ? (
            <div className="font-mono text-[0.65rem] text-violet-300 tabular-nums">
              Peak {formatNumber(row.peakDamage)}
            </div>
          ) : null}
          <div className="mt-1">
            <PillStatusLine fight={fight} pillEndsAt={member.display.pillEndsAt} nowMs={nowMs} />
          </div>
        </div>

        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${member.username ?? member.userId}`}
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {expanded ? (
        <dl className="grid grid-cols-2 gap-2 border-t border-border/45 bg-background/20 px-3 py-3 sm:grid-cols-3 lg:grid-cols-6">
          <Detail label="ATK" value={formatNumber(fight?.atk ?? null)} accent />
          <Detail label="Mil rank bonus" value={formatPercent(member.display.militaryRankBonus)} />
          <Detail label="Precision" value={formatPercent(fight?.precision ?? null)} />
          <Detail label="Crit" value={formatPercent(fight?.critChance ?? null)} />
          <Detail label="Crit dmg" value={formatPercent(fight?.critDamage ?? null)} />
          <Detail label="Armor" value={formatNumber(fight?.armor ?? null)} />
          <Detail label="Dodge" value={formatNumber(fight?.dodge ?? null)} />
          <Detail
            label="Hunger"
            value={
              fight && projected
                ? `${formatNumber(projected.hunger)} / ${formatNumber(fight.maxHunger)}`
                : "—"
            }
          />
          <Detail label="Ammo" value={member.display.ammoLabel ?? "—"} />
          <Detail label="Dmg / hit" value={formatNumber(row.damagePerHit, 1)} accent />
          <Detail label="Pill" value={complete ? pillText : "—"} />
        </dl>
      ) : null}
    </article>
  );
}
