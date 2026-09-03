import { defineChart, lineY } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleUtc } from "d3-scale";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { colorForUserId } from "./formatMu";
import type { MuMemberHistorySeries } from "./types";

const MAX_SERIES = 25;
const CHART_HEIGHT = 520;

type ChartRow = {
  date: Date;
  value: number;
};

type PreparedSeries = {
  userId: string;
  label: string;
  color: string;
  rows: ChartRow[];
};

function prepareSeries(series: MuMemberHistorySeries[]): PreparedSeries[] {
  return series
    .slice(0, MAX_SERIES)
    .map((s) => ({
      userId: s.userId,
      label: s.label,
      color: colorForUserId(s.userId),
      rows: s.points
        .filter((p) => p.value != null && Number.isFinite(p.value))
        .map((p) => ({
          date: new Date(p.recordedAt),
          value: p.value as number,
        })),
    }))
    .filter((s) => s.rows.length > 0);
}

export function MuMemberHistoryChart({
  series,
  metricLabel,
}: {
  series: MuMemberHistorySeries[];
  metricLabel: string;
}) {
  const prepared = useMemo(() => prepareSeries(series), [series]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const active = useMemo(() => prepared.filter((s) => !hidden.has(s.userId)), [prepared, hidden]);

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          ...active.map((s) =>
            lineY(s.rows, {
              id: s.label,
              x: "date",
              y: "value",
              stroke: s.color,
              strokeWidth: 2,
            }),
          ),
          crosshair({ x: { label: true }, y: false }),
        ],
        scales: {
          x: { scale: scaleUtc, nice: true, axis: { label: "Time" } },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: metricLabel } },
        },
        focus: "nearest-x",
        maxFocusDistance: Number.POSITIVE_INFINITY,
        tooltip: {
          use: tooltip,
          items: ["x", { channel: "group", label: "Member" }, { channel: "y", label: metricLabel }],
        },
      }),
    [active, metricLabel],
  );

  function toggleSeries(userId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  if (prepared.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No plottable member points in this range.</p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Member series legend">
        {prepared.map((s) => {
          const on = !hidden.has(s.userId);
          return (
            <Button
              key={s.userId}
              type="button"
              size="sm"
              variant={on ? "outline" : "ghost"}
              className="h-7 gap-1.5 px-2 text-xs"
              aria-pressed={on}
              onClick={() => toggleSeries(s.userId)}
            >
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: s.color, opacity: on ? 1 : 0.35 }}
                aria-hidden
              />
              {s.label}
            </Button>
          );
        })}
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Toggle a member above to show their series.</p>
      ) : (
        <Chart
          definition={definition}
          height={CHART_HEIGHT}
          ariaLabel={`Member ${metricLabel} history`}
        />
      )}
    </div>
  );
}
