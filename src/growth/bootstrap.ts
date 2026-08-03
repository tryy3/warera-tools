import type { Db } from "../db/client";
import { getLatestPrices, marketPriceMap } from "../db/prices";
import { listMarketOpportunities } from "../economy/profit";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "../warera/prices";

export type GrowthBootstrapResponse = {
  recordedAt: string | null;
  prices: { steel: number | null; concrete: number | null };
  bestItem: { itemCode: string; profitPerPp: number; suggestedBonus: number } | null;
  opportunitiesLite: { itemCode: string; profitPerPp: number }[];
  startBalance: number;
  steel: number;
  concrete: number;
};

export type MapGrowthBootstrapInput = {
  recordedAt: string | null;
  prices: Record<string, number>;
  opportunities: { itemCode: string; profitPerPp: number | null }[];
};

export function mapGrowthBootstrap(input: MapGrowthBootstrapInput): GrowthBootstrapResponse {
  const opportunitiesLite = input.opportunities.flatMap((o) =>
    o.profitPerPp != null && Number.isFinite(o.profitPerPp)
      ? [{ itemCode: o.itemCode, profitPerPp: o.profitPerPp }]
      : [],
  );

  const top = opportunitiesLite[0];
  const bestItem = top
    ? {
        itemCode: top.itemCode,
        profitPerPp: top.profitPerPp,
        suggestedBonus: 0,
      }
    : null;

  return {
    recordedAt: input.recordedAt,
    prices: {
      steel: input.prices.steel ?? null,
      concrete: input.prices.concrete ?? null,
    },
    bestItem,
    opportunitiesLite,
    startBalance: 0,
    steel: 0,
    concrete: 0,
  };
}

export async function buildGrowthBootstrap(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  userId: string;
  refresh?: boolean;
}): Promise<GrowthBootstrapResponse> {
  const { db, warera, logger } = options;

  let latest = await getLatestPrices(db);
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const prices = latest ? marketPriceMap(latest) : {};
  const opportunities = listMarketOpportunities(prices);

  return mapGrowthBootstrap({
    recordedAt: latest?.recordedAt.toISOString() ?? null,
    prices,
    opportunities,
  });
}
