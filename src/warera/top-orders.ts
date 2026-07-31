import { unwrapTrpcData, wareraProcedurePath } from "./trpc";
import type { WareraRequester } from "./prices";

export type OrderSideAggregates = {
  min: number | null;
  max: number | null;
  avg: number | null;
};

export type TopOrderAggregates = {
  buy: OrderSideAggregates;
  sell: OrderSideAggregates;
};

type RawOrder = { price?: unknown };

function aggregatePrices(orders: RawOrder[]): OrderSideAggregates {
  const prices = orders
    .map((o) => o.price)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p >= 0);
  if (prices.length === 0) {
    return { min: null, max: null, avg: null };
  }
  let min = prices[0]!;
  let max = prices[0]!;
  let sum = 0;
  for (const p of prices) {
    if (p < min) min = p;
    if (p > max) max = p;
    sum += p;
  }
  return { min, max, avg: sum / prices.length };
}

export function parseTopOrderAggregates(trpcJson: unknown): TopOrderAggregates {
  const data = unwrapTrpcData<{ buyOrders?: unknown; sellOrders?: unknown }>(trpcJson);
  const buyOrders = Array.isArray(data.buyOrders) ? (data.buyOrders as RawOrder[]) : [];
  const sellOrders = Array.isArray(data.sellOrders) ? (data.sellOrders as RawOrder[]) : [];
  return {
    buy: aggregatePrices(buyOrders),
    sell: aggregatePrices(sellOrders),
  };
}

export async function fetchTopOrderAggregates(
  warera: WareraRequester,
  itemCode: string,
  limit = 10,
): Promise<TopOrderAggregates> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("tradingOrder.getTopOrders", { itemCode, limit }),
  );
  return parseTopOrderAggregates(json);
}
