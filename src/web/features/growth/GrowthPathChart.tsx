import { defineChart, lineY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear } from "d3-scale";
import { useMemo } from "react";
import type { GrowthPlanResult } from "./types";

type Row = { tHours: number; optimal?: number; upgradesOnly?: number };

const OPTIMAL_STROKE = "#0f766e";
const UPGRADES_STROKE = "#b45309";

function mergeSeries(
  optimal: GrowthPlanResult | null,
  upgradesOnly: GrowthPlanResult | null,
): Row[] {
  const times = new Set<number>();
  for (const p of optimal?.series ?? []) times.add(p.tHours);
  for (const p of upgradesOnly?.series ?? []) times.add(p.tHours);
  if (times.size === 0) times.add(0);

  const sorted = [...times].toSorted((a, b) => a - b);
  const optAt = new Map((optimal?.series ?? []).map((p) => [p.tHours, p.dailyGold]));
  const upAt = new Map((upgradesOnly?.series ?? []).map((p) => [p.tHours, p.dailyGold]));

  let lastOpt: number | undefined;
  let lastUp: number | undefined;
  const rows: Row[] = [];

  for (const t of sorted) {
    if (optAt.has(t)) lastOpt = optAt.get(t);
    if (upAt.has(t)) lastUp = upAt.get(t);
    rows.push({
      tHours: t,
      optimal: lastOpt,
      upgradesOnly: lastUp,
    });
  }

  return rows;
}

export function GrowthPathChart({
  optimal,
  upgradesOnly,
}: {
  optimal: GrowthPlanResult | null;
  upgradesOnly: GrowthPlanResult | null;
}) {
  const rows = useMemo(() => mergeSeries(optimal, upgradesOnly), [optimal, upgradesOnly]);

  const optimalRows = useMemo(
    () => rows.filter((r) => r.optimal != null && Number.isFinite(r.optimal)),
    [rows],
  );
  const upgradesRows = useMemo(
    () => rows.filter((r) => r.upgradesOnly != null && Number.isFinite(r.upgradesOnly)),
    [rows],
  );

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(optimalRows, {
            x: "tHours",
            y: "optimal",
            stroke: OPTIMAL_STROKE,
            strokeWidth: 2,
          }),
          lineY(upgradesRows, {
            x: "tHours",
            y: "upgradesOnly",
            stroke: UPGRADES_STROKE,
            strokeWidth: 2,
          }),
        ],
        x: { scale: scaleLinear, nice: true, axis: { label: "Hours" } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "G/day" } },
        tooltip,
      }),
    [optimalRows, upgradesRows],
  );

  if (optimalRows.length === 0 && upgradesRows.length === 0) {
    return <p className="text-sm text-muted-foreground">No production curve to plot yet.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: OPTIMAL_STROKE }}
            aria-hidden
          />
          Optimal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: UPGRADES_STROKE }}
            aria-hidden
          />
          Upgrades-only
        </span>
      </div>
      <Chart definition={definition} height={360} ariaLabel="Growth path daily gold over time" />
    </div>
  );
}
