import { useEffect, useMemo, useState } from "react";
import { classifyBuildFromSkillLevels } from "../../../build-class/classify";
import { aggregateFightDesk } from "../../../fight-damage/aggregate";
import { FIGHT_FOOD_OPTIONS, foodBonusForId } from "../../../fight-damage/food";
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
    if (!initialPresetDone) return;
    saveFightDeskPrefs(muId, prefs);
  }, [initialPresetDone, muId, prefs]);

  const summary = useMemo(() => {
    const players = (query.data?.members ?? []).flatMap((member) =>
      member.fight ? [member.fight] : [],
    );
    return aggregateFightDesk(players, new Set(prefs.selectedUserIds), {
      foodId: prefs.foodId,
      foodBonus: foodBonusForId(prefs.foodId),
      battleBonus: prefs.battleBonus,
      ticks: prefs.ticks,
    });
  }, [prefs, query.data?.members]);

  function updatePrefs(patch: Partial<FightDeskPrefsV1>) {
    setPrefs((current) => ({ ...current, ...patch }));
  }

  function applyPreset(preset: FightDeskPresetId) {
    updatePrefs({
      selectedUserIds: applyFightDeskPreset(preset, presetMembers),
      lastPresetId: preset,
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
                Battle bonus %
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 block h-8 w-28 rounded-lg border border-input bg-secondary px-2.5 font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={prefs.battleBonus * 100}
                  onChange={(event) =>
                    updatePrefs({ battleBonus: numericInputValue(event.target.value) / 100 })
                  }
                />
              </label>
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
        <SummaryCard
          label="Full pill-potential"
          value={formatDisplayNumber(summary.fullPillPotential, 0)}
        />
        <SummaryCard label="Members" value={formatDisplayNumber(summary.selectedCount, 0)} />
        <SummaryCard label="Avg / member" value={formatDisplayNumber(summary.avgPerMember, 0)} />
        <SummaryCard label="Top" value={formatDisplayNumber(summary.topDamage, 0)} />
      </section>

      <section className="rounded-md border border-dashed border-border px-4 py-8 text-center">
        <p className="m-0 text-sm font-medium">Member damage rows arrive next.</p>
        <p className="mt-1 mb-0 text-xs text-muted-foreground">
          Presets and totals already use the latest complete fight snapshots.
        </p>
      </section>
    </div>
  );
}
