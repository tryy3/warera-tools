export type LatestPricesResponse = {
  pollId: number;
  recordedAt: string;
  status: string;
  items: Array<{
    itemCode: string;
    marketPrice: number | null;
    buyMin: number | null;
    buyMax: number | null;
    buyAvg: number | null;
    sellMin: number | null;
    sellMax: number | null;
    sellAvg: number | null;
  }>;
};

export type PriceHistoryPointDto = {
  recordedAt: string;
  marketPrice: number | null;
  topBuy: number | null;
  topSell: number | null;
};

export type PriceChangeDto = { absolute: number; percent: number };

export type PriceHistoryResponse = {
  itemCode: string;
  range: "24h" | "7d" | "30d";
  latest: PriceHistoryPointDto | null;
  change24h: PriceChangeDto | null;
  change7d: PriceChangeDto | null;
  points: PriceHistoryPointDto[];
};

export type LatestPriceItem = LatestPricesResponse["items"][number];
