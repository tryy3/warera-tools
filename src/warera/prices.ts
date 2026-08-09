import type { WareraRequestInit } from "./client";
import {
  unwrapTrpcData,
  wareraProcedurePath,
  type TrpcBatchSlotResult,
  type WareraBatchItem,
} from "./trpc";

export type ItemPriceMap = Record<string, number>;

export function parseItemPrices(trpcJson: unknown): ItemPriceMap {
  const data = unwrapTrpcData<Record<string, unknown>>(trpcJson);
  const out: ItemPriceMap = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      out[key] = value;
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error("WarEra itemTrading.getPrices returned no valid item prices");
  }
  return out;
}

export function parseScrapsPrice(trpcJson: unknown): number {
  const prices = parseItemPrices(trpcJson);
  const price = prices.scraps;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("WarEra itemTrading.getPrices did not return a valid scraps price");
  }
  return price;
}

export type WareraRequester = {
  request: <T>(path: string, init?: WareraRequestInit) => Promise<T>;
  /** Optional: production client always provides this for tRPC HTTP batching. */
  requestBatch?: (
    items: WareraBatchItem[],
    init?: WareraRequestInit,
  ) => Promise<TrpcBatchSlotResult[]>;
};

export async function fetchItemPrices(warera: WareraRequester): Promise<ItemPriceMap> {
  const json = await warera.request<unknown>(wareraProcedurePath("itemTrading.getPrices"));
  return parseItemPrices(json);
}

export async function fetchScrapsPrice(warera: WareraRequester): Promise<number> {
  const prices = await fetchItemPrices(warera);
  const price = prices.scraps;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("WarEra itemTrading.getPrices did not return a valid scraps price");
  }
  return price;
}
