import { defineChart, lineY } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleUtc } from "d3-scale";
import { useMemo } from "react";
import type { MuHistoryPoint } from "./types";

type ChartRow = {
  date: Date;
  value: number;
};

export function MuHistoryChart({
  points,
  metricLabel,
}: {
  points: MuHistoryPoint[];
  metricLabel: string;
}) {
  const rows = useMemo<ChartRow[]>(
    () =>
      points
        .filter((p) => p.value != null && Number.isFinite(p.value))
        .map((p) => ({
          date: new Date(p.recordedAt),
          value: p.value as number,
        })),
    [points],
  );

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(rows, {
            x: "date",
            y: "value",
            strokeWidth: 2,
          }),
        ],
        scales: {
          x: { scale: scaleUtc, nice: true, axis: { label: "Time" } },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: metricLabel } },
        },
        tooltip,
      }),
    [rows, metricLabel],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No plottable points in this range.</p>;
  }

  return <Chart definition={definition} height={360} ariaLabel={`MU ${metricLabel} history`} />;
}
