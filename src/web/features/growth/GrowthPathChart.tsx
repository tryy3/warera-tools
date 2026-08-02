import { defineChart, lineY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear } from "d3-scale";
import { useMemo } from "react";
import { PATH_THEME, type PathThemeKey } from "./pathTheme";
import type { GrowthPlanResult } from "./types";

type Row = {
  tDays: number;
  cheapest?: number;
  income_roi?: number;
  upgrade_first?: number;
};

const SERIES = ["cheapest", "income_roi", "upgrade_first"] as const satisfies PathThemeKey[];

function mergeSeries(plans: Record<PathThemeKey, GrowthPlanResult | null>): Row[] {
  const times = new Set<number>();
  for (const key of SERIES) {
    for (const p of plans[key]?.series ?? []) times.add(p.tHours);
  }
  if (times.size === 0) times.add(0);

  const sorted = [...times].toSorted((a, b) => a - b);
  const maps = Object.fromEntries(
    SERIES.map((key) => [
      key,
      new Map((plans[key]?.series ?? []).map((p) => [p.tHours, p.dailyGold])),
    ]),
  ) as Record<PathThemeKey, Map<number, number>>;

  const last: Partial<Record<PathThemeKey, number>> = {};
  const rows: Row[] = [];

  for (const t of sorted) {
    const row: Row = { tDays: t / 24 };
    for (const key of SERIES) {
      if (maps[key].has(t)) last[key] = maps[key].get(t);
      if (last[key] != null) row[key] = last[key];
    }
    rows.push(row);
  }

  return rows;
}

export function GrowthPathChart({
  plans,
}: {
  plans: Record<PathThemeKey, GrowthPlanResult | null>;
}) {
  const rows = useMemo(() => mergeSeries(plans), [plans]);

  const seriesRows = useMemo(() => {
    const out = {} as Record<PathThemeKey, Row[]>;
    for (const key of SERIES) {
      out[key] = rows.filter((r) => r[key] != null && Number.isFinite(r[key]));
    }
    return out;
  }, [rows]);

  const definition = useMemo(
    () =>
      defineChart({
        marks: SERIES.map((key) =>
          lineY(seriesRows[key], {
            x: "tDays",
            y: key,
            stroke: PATH_THEME[key].stroke,
            strokeWidth: 2.5,
          }),
        ),
        x: { scale: scaleLinear, nice: true, axis: { label: "Days" } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "G/day" } },
        tooltip,
      }),
    [seriesRows],
  );

  const anyRows = SERIES.some((key) => seriesRows[key].length > 0);
  if (!anyRows) {
    return <p className="text-sm text-muted-foreground">No production curve to plot yet.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        {SERIES.map((key) => (
          <span key={key} className={`inline-flex items-center gap-2 ${PATH_THEME[key].text}`}>
            <span
              className="inline-block h-0.5 w-5 rounded-full"
              style={{ backgroundColor: PATH_THEME[key].stroke }}
              aria-hidden
            />
            {PATH_THEME[key].label}
          </span>
        ))}
      </div>
      <Chart definition={definition} height={360} ariaLabel="Growth path daily gold over days" />
    </div>
  );
}
