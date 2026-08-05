import { defineChart, lineY, ruleY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear, scaleUtc } from "d3-scale";
import { useMemo } from "react";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";

type DailyMedian = { day: string; median: number; trades: number };

type ChartRow = {
  date: Date;
  median: number;
  trades: number;
};

export function EquipmentTrendChart({
  dailyMedians,
  scrapFloor,
  itemLabel,
}: {
  dailyMedians: DailyMedian[];
  scrapFloor?: number | null;
  itemLabel: string;
}) {
  const rows = useMemo<ChartRow[]>(
    () =>
      dailyMedians
        .filter((p) => Number.isFinite(p.median))
        .map((p) => ({
          date: new Date(`${p.day}T00:00:00.000Z`),
          median: p.median,
          trades: p.trades,
        })),
    [dailyMedians],
  );

  const floor = scrapFloor != null && Number.isFinite(scrapFloor) ? scrapFloor : null;

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(rows, {
            x: "date",
            y: "median",
            strokeWidth: 2,
          }),
          ...(floor != null
            ? [
                ruleY([{ floor }], {
                  y: "floor",
                  strokeDasharray: "4 3",
                  strokeOpacity: 0.75,
                  strokeWidth: 1.5,
                }),
              ]
            : []),
        ],
        x: { scale: scaleUtc, nice: true, axis: { label: "Day" } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Median" } },
        tooltip,
      }),
    [rows, floor],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No sales in band</p>;
  }

  return (
    <div>
      {floor != null ? (
        <div className="mb-2 text-xs text-muted-foreground">
          Dashed line = scrap floor ({formatDisplayNumber(floor)})
        </div>
      ) : null}
      <Chart
        definition={definition}
        height={320}
        ariaLabel={`${itemLabel} daily median price trend`}
      />
    </div>
  );
}
