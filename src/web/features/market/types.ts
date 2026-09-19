import type { PriceHistoryRange } from "@/market/ranges";

export type LatestPricesResponse = {
  pollId: number;
  recordedAt: string;
  status: string;
  items: Array<{
    itemCode: string;
    marketPrice: string | null;
    buyMin: string | null;
    buyMax: string | null;
    buyAvg: string | null;
    sellMin: string | null;
    sellMax: string | null;
    sellAvg: string | null;
  }>;
};

export type PriceHistoryPointDto = {
  recordedAt: string;
  marketPrice: string | null;
  topBuy: string | null;
  topSell: string | null;
};

export type PriceChangeDto = { absolute: number; percent: number };

export type PriceHistoryResponse = {
  itemCode: string;
  range: PriceHistoryRange;
  latest: PriceHistoryPointDto | null;
  change24h: PriceChangeDto | null;
  change7d: PriceChangeDto | null;
  points: PriceHistoryPointDto[];
};

export type LatestPriceItem = LatestPricesResponse["items"][number];

export type MyTradesChunkDto = {
  side: "buy" | "sell";
  unitPrice: string;
  totalQty: number;
  totalMoney: string;
  startAt: string;
  endAt: string;
  fillCount: number;
};

export type MyTradesResponse = {
  itemCode: string;
  playerId: string;
  range: PriceHistoryRange;
  chunks: MyTradesChunkDto[];
  realized: { pnl: string | null; sellQty: number; buyQty: number };
  historyIncomplete: boolean;
  fillCount: number;
};
