import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useMemo } from "react";
import { moneyToNumber } from "@/money/decimal";

type LadderBucket = { bucketLabel: string; median: string | number; trades: number };

export function EquipmentLadderChart({
  ladder,
  itemLabel,
}: {
  ladder: LadderBucket[];
  itemLabel: string;
}) {
  const rows = useMemo(
    () =>
      ladder.flatMap((b) => {
        const median = moneyToNumber(b.median);
        if (median == null || b.bucketLabel.length === 0) return [];
        return [{ bucketLabel: b.bucketLabel, median, trades: b.trades }];
      }),
    [ladder],
  );

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(rows, {
            x: "bucketLabel",
            y: "median",
            fillOpacity: 0.85,
          }),
        ],
        scales: {
          x: {
            scale: () => scaleBand().paddingInner(0.2).paddingOuter(0.1),
            axis: { label: "Stat" },
          },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Median" } },
        },
        tooltip,
      }),
    [rows],
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No sales in band</p>;
  }

  return (
    <Chart definition={definition} height={320} ariaLabel={`${itemLabel} skill ladder medians`} />
  );
}
