import { areaY, defineChart, dot, lineY } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleUtc } from "d3-scale";
import { useMemo } from "react";
import { moneyToNumber } from "@/money/decimal";
import type { PriceHistoryPointDto } from "./types";

type ChartRow = {
  date: Date;
  marketPrice: number | null;
  topBuy: number | null;
  topSell: number | null;
};

export type TradeDot = {
  date: Date;
  price: number;
  side: "buy" | "sell";
  label: string;
};

const BUY_DOT_FILL = "#60a5fa";
const SELL_DOT_FILL = "#f87171";

export function MarketPriceChart({
  points,
  itemLabel,
  tradeDots,
}: {
  points: PriceHistoryPointDto[];
  itemLabel: string;
  tradeDots?: TradeDot[];
}) {
  const rows = useMemo<ChartRow[]>(
    () =>
      points.map((p) => ({
        date: new Date(p.recordedAt),
        marketPrice: moneyToNumber(p.marketPrice),
        topBuy: moneyToNumber(p.topBuy),
        topSell: moneyToNumber(p.topSell),
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

  const buyDots = useMemo(() => (tradeDots ?? []).filter((d) => d.side === "buy"), [tradeDots]);

  const sellDots = useMemo(() => (tradeDots ?? []).filter((d) => d.side === "sell"), [tradeDots]);

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
          ...(buyDots.length > 0
            ? [
                dot(buyDots, {
                  x: "date",
                  y: "price",
                  fill: BUY_DOT_FILL,
                  r: 5,
                }),
              ]
            : []),
          ...(sellDots.length > 0
            ? [
                dot(sellDots, {
                  x: "date",
                  y: "price",
                  fill: SELL_DOT_FILL,
                  r: 5,
                }),
              ]
            : []),
        ],
        scales: {
          x: { scale: scaleUtc, nice: true, axis: { label: "Time" } },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: "Price" } },
        },
        tooltip: {
          use: tooltip,
          items: [
            {
              id: "trade-label",
              text: (point) => {
                const label = (point.datum as { label?: unknown }).label;
                return typeof label === "string" ? label : null;
              },
            },
            "y",
            "x",
          ],
        },
      }),
    [ribbon, market, buyDots, sellDots],
  );

  if (market.length === 0 && ribbon.length === 0) {
    return <p className="text-sm text-muted-foreground">No plottable points in this range.</p>;
  }

  return (
    <Chart definition={definition} height={360} ariaLabel={`${itemLabel} market price history`} />
  );
}
