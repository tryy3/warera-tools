import { areaY, defineChart, lineY } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear, scaleUtc } from "d3-scale";
import { useMemo } from "react";
import type { PriceHistoryPointDto } from "./types";

type ChartRow = {
  date: Date;
  marketPrice: number | null;
  topBuy: number | null;
  topSell: number | null;
};

export function MarketPriceChart({
  points,
  itemLabel,
}: {
  points: PriceHistoryPointDto[];
  itemLabel: string;
}) {
  const rows = useMemo<ChartRow[]>(
    () =>
      points.map((p) => ({
        date: new Date(p.recordedAt),
        marketPrice: p.marketPrice,
        topBuy: p.topBuy,
        topSell: p.topSell,
      })),
    [points],
  );

  const ribbon = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.topBuy != null &&
          r.topSell != null &&
          Number.isFinite(r.topBuy) &&
          Number.isFinite(r.topSell),
      ),
    [rows],
  );

  const market = useMemo(
    () => rows.filter((r) => r.marketPrice != null && Number.isFinite(r.marketPrice)),
    [rows],
  );

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          areaY(ribbon, {
            x: "date",
            y1: "topBuy",
            y2: "topSell",
            fillOpacity: 0.2,
          }),
          lineY(market, {
            x: "date",
            y: "marketPrice",
            strokeWidth: 2,
          }),
        ],
        x: { scale: scaleUtc, nice: true, axis: { label: "Time" } },
        y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Price" } },
        tooltip,
      }),
    [ribbon, market],
  );

  if (market.length === 0 && ribbon.length === 0) {
    return <p className="text-sm text-muted-foreground">No plottable points in this range.</p>;
  }

  return (
    <Chart definition={definition} height={360} ariaLabel={`${itemLabel} market price history`} />
  );
}
