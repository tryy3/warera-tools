import { useEffect, useMemo, useRef, useState } from "react";
import { classifyBuildFromSkillLevels } from "../../../build-class/classify";
import { aggregateFightDesk } from "../../../fight-damage/aggregate";
import { FIGHT_FOOD_OPTIONS, foodBonusForId } from "../../../fight-damage/food";
import type { FightPlayerInput } from "../../../fight-damage/types";
import { Button } from "@/components/ui/button";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import {
  defaultFightDeskPrefs,
  loadFightDeskPrefs,
  saveFightDeskPrefs,
  type FightDeskPrefsV1,
} from "../../lib/fightDeskPrefs";
import {
  applyFightDeskPreset,
  isFightDeskRosterReadyForInitialPreset,
  type FightDeskPresetId,
} from "../../lib/fightDeskSelection";
import { useMuFightDeskQuery, useRefreshMuFightDesk } from "../../query/useMuFightDeskQuery";
import { FightDeskBattleStrip } from "./FightDeskBattleStrip";
import { FightDeskMemberRow } from "./FightDeskMemberRow";
import { resolveFightDeskBattleSelection } from "./fightDeskBattleSelection";
import type { MuFightDeskBattle } from "./types";
import {
  buildFightDeskMemberRows,
  sortFightDeskMemberRows,
  type FightDeskSort,
} from "./fightDeskMemberRows";

const EMPTY_BATTLES: MuFightDeskBattle[] = [];

const PRESETS: Array<{ id: FightDeskPresetId; label: string }> = [
  { id: "pilled", label: "Pilled" },
  { id: "ready", label: "Ready" },
  { id: "pilled_ready", label: "Pilled + ready" },
  { id: "damage_build", label: "Damage build" },
  { id: "all", label: "All" },
  { id: "none", label: "None" },
];

function formatAge(asOf: string | null): string {
  if (!asOf) return "not warmed";
  const ageMs = Math.max(0, Date.now() - new Date(asOf).getTime());
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function numericInputValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-3">
      <div className="text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function FightDeskTab({ muId }: { muId: string }) {
  const query = useMuFightDeskQuery(muId);
  const refresh = useRefreshMuFightDesk(muId);
  const [initial] = useState(() => {
    const stored = loadFightDeskPrefs(muId);
    return { prefs: stored ?? defaultFightDeskPrefs(), applyInitialPreset: stored == null };
  });
  const [prefs, setPrefs] = useState<FightDeskPrefsV1>(initial.prefs);
  const [initialPresetDone, setInitialPresetDone] = useState(!initial.applyInitialPreset);
  const [autoSelectConsumed, setAutoSelectConsumed] = useState(!initial.applyInitialPreset);
  const previousBattlesRef = useRef<MuFightDeskBattle[]>([]);
  const [sort, setSort] = useState<FightDeskSort>("now");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const presetMembers = useMemo(
    () =>
      (query.data?.members ?? []).flatMap((member) => {
        if (!member.fight) return [];
        const skills = Object.fromEntries(
          Object.entries(member.display.skillLevels).map(([id, level]) => [id, { level }]),
        );
        return [
          {
            userId: member.userId,
            pillStatus: member.fight.pillStatus,
            buildClass: classifyBuildFromSkillLevels(skills),
          },
        ];
      }),
    [query.data?.members],
  );

  useEffect(() => {
    if (initialPresetDone || !query.data) return;
    if (!isFightDeskRosterReadyForInitialPreset(query.data.members)) return;

    setPrefs((current) => {
      if (current.selectedUserIds.length > 0) return current;
      return {
        ...current,
        selectedUserIds: applyFightDeskPreset("pilled", presetMembers),
        lastPresetId: "pilled",
      };
    });
    setInitialPresetDone(true);
  }, [initialPresetDone, presetMembers, query.data]);

  useEffect(() => {
    if (!initialPresetDone || !query.data) return;
    saveFightDeskPrefs(muId, prefs);
  }, [initialPresetDone, muId, prefs, query.data]);

  const battles = query.data?.battles ?? EMPTY_BATTLES;

  useEffect(() => {
    const next = resolveFightDeskBattleSelection({
      battlesLoaded: query.data != null,
      battles: query.data?.battles ?? EMPTY_BATTLES,
      previousBattles: previousBattlesRef.current,
      selectedBattleId: prefs.selectedBattleId,
      battleBonus: prefs.battleBonus,
      applyInitialPreset: initial.applyInitialPreset,
      autoSelectConsumed,
    });
    if (query.data) previousBattlesRef.current = query.data.battles;

    if (next.autoSelectConsumed !== autoSelectConsumed) {
      setAutoSelectConsumed(next.autoSelectConsumed);
    }
    if (
      next.selectedBattleId !== prefs.selectedBattleId ||
      next.battleBonus !== prefs.battleBonus
    ) {
      setPrefs((current) => ({
        ...current,
        selectedBattleId: next.selectedBattleId,
        battleBonus: next.battleBonus,
      }));
    }
  }, [
    autoSelectConsumed,
    initial.applyInitialPreset,
    prefs.battleBonus,
    prefs.selectedBattleId,
    query.data,
  ]);

  const selectedLiveBattle = useMemo(() => {
    if (prefs.selectedBattleId === "custom") return null;
    return battles.find((battle) => battle.id === prefs.selectedBattleId) ?? null;
  }, [battles, prefs.selectedBattleId]);

  const fightKnobs = useMemo(
    () => ({
      foodId: prefs.foodId,
      foodBonus: foodBonusForId(prefs.foodId),
      battleBonus: selectedLiveBattle ? selectedLiveBattle.bonus.total : prefs.battleBonus,
      ticks: prefs.ticks,
    }),
    [prefs.battleBonus, prefs.foodId, prefs.ticks, selectedLiveBattle],
  );

  const peaksByUserId = useMemo(() => {
    const map = new Map<string, FightPlayerInput>();
    for (const member of query.data?.members ?? []) {
      if (member.peakFight) map.set(member.userId, member.peakFight);
    }
    return map;
  }, [query.data?.members]);

  const summary = useMemo(
    () =>
      aggregateFightDesk(
        (query.data?.members ?? []).flatMap((m) => (m.fight ? [m.fight] : [])),
        new Set(prefs.selectedUserIds),
        fightKnobs,
        peaksByUserId,
      ),
    [fightKnobs, peaksByUserId, prefs.selectedUserIds, query.data?.members],
  );

  const memberRows = useMemo(
    () => buildFightDeskMemberRows(query.data?.members ?? [], fightKnobs),
    [fightKnobs, query.data?.members],
  );
  const sortedMemberRows = useMemo(
    () => sortFightDeskMemberRows(memberRows, sort),
    [memberRows, sort],
  );

  function updatePrefs(patch: Partial<FightDeskPrefsV1>) {
    setPrefs((current) => ({ ...current, ...patch }));
  }

  function applyPreset(preset: FightDeskPresetId) {
    updatePrefs({
      selectedUserIds: applyFightDeskPreset(preset, presetMembers),
      lastPresetId: preset,
    });
  }

  function setMemberSelected(userId: string, selected: boolean) {
    setPrefs((current) => {
      const selectedIds = new Set(current.selectedUserIds);
      if (selected) selectedIds.add(userId);
      else selectedIds.delete(userId);
      return {
        ...current,
        selectedUserIds: [...selectedIds],
        lastPresetId: null,
      };
    });
  }

  function setMemberExpanded(userId: string, expanded: boolean) {
    setPrefs((current) => {
      const expandedIds = new Set(current.expandedUserIds);
      if (expanded) expandedIds.add(userId);
      else expandedIds.delete(userId);
      return { ...current, expandedUserIds: [...expandedIds] };
    });
  }

  const error =
    query.error instanceof Error
      ? query.error.message
      : refresh.error instanceof Error
        ? refresh.error.message
        : null;

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading Fight Desk…</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border/70 bg-background/25">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Fight Desk
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-violet-300">
                {summary.pillCounts.active} active
              </span>
              <span className="rounded-full border border-red-500/35 bg-red-500/10 px-2 py-0.5 text-red-300">
                {summary.pillCounts.debuff} debuff
              </span>
              <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                {summary.pillCounts.ready} ready
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Data {formatAge(query.data?.asOf ?? null)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              <span aria-hidden="true">↻</span>
              {refresh.isPending ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label
              htmlFor="fight-desk-food"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Food
            </label>
            <select
              id="fight-desk-food"
              className="h-8 min-w-52 rounded-lg border border-input bg-secondary px-2.5 text-sm text-foreground scheme-dark outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={prefs.foodId}
              onChange={(event) => updatePrefs({ foodId: event.target.value })}
            >
              {FIGHT_FOOD_OPTIONS.map((food) => (
                <option key={food.id} value={food.id}>
                  {food.label}
                </option>
              ))}
            </select>
          </div>

          <details className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Advanced
            </summary>
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="text-xs text-muted-foreground">
                Ticks (hours)
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 block h-8 w-28 rounded-lg border border-input bg-secondary px-2.5 font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={prefs.ticks}
                  onChange={(event) =>
                    updatePrefs({ ticks: Math.max(0, numericInputValue(event.target.value)) })
                  }
                />
              </label>
            </div>
          </details>
        </div>
        <div className="border-t border-border/60 p-4">
          <FightDeskBattleStrip
            battles={battles}
            selectedBattleId={prefs.selectedBattleId}
            customBonus={prefs.battleBonus}
            onSelectBattle={(selectedBattleId) => updatePrefs({ selectedBattleId })}
            onCustomBonusChange={(battleBonus) =>
              updatePrefs({ battleBonus, selectedBattleId: "custom" })
            }
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section>
        <div className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Selection presets
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={prefs.lastPresetId === preset.id ? "default" : "outline"}
              aria-pressed={prefs.lastPresetId === preset.id}
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard label="Now" value={formatDisplayNumber(summary.now, 0)} />
        <SummaryCard label="Peak" value={formatDisplayNumber(summary.peakPotential, 0)} />
        <SummaryCard label="Members" value={formatDisplayNumber(summary.selectedCount, 0)} />
        <SummaryCard label="Avg / member" value={formatDisplayNumber(summary.avgPerMember, 0)} />
        <SummaryCard label="Top" value={formatDisplayNumber(summary.topDamage, 0)} />
      </section>

      <section className="overflow-hidden rounded-md border border-border/70 bg-background/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
          <div>
            <h2 className="m-0 text-sm font-semibold">Member readiness</h2>
            <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
              Projected with the current food, bonus, and tick settings.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select
              className="h-8 rounded-lg border border-input bg-secondary px-2.5 text-sm text-foreground scheme-dark outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={sort}
              onChange={(event) => setSort(event.target.value as FightDeskSort)}
            >
              <option value="now">Total now</option>
              <option value="potential">Peak</option>
              <option value="hp">HP</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        {sortedMemberRows.length > 0 ? (
          <div>
            {sortedMemberRows.map((row, index) => (
              <FightDeskMemberRow
                key={row.member.userId}
                row={row}
                rank={index + 1}
                selected={prefs.selectedUserIds.includes(row.member.userId)}
                expanded={prefs.expandedUserIds.includes(row.member.userId)}
                nowMs={nowMs}
                onSelectedChange={(selected) => setMemberSelected(row.member.userId, selected)}
                onExpandedChange={(expanded) => setMemberExpanded(row.member.userId, expanded)}
              />
            ))}
          </div>
        ) : (
          <p className="m-0 px-4 py-8 text-center text-sm text-muted-foreground">
            No MU members found.
          </p>
        )}
      </section>
    </div>
  );
}
