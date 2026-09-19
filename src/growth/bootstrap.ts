import type { Db } from "../db/client";
import { getLatestPrices, marketPriceMap } from "../db/prices";
import { listMarketOpportunities } from "../economy/profit";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import { Decimal, isFiniteMoney, serializeMoney } from "../money/decimal";
import type { WareraRequester } from "../warera/prices";

export type GrowthBootstrapResponse = {
  recordedAt: string | null;
  prices: { steel: string | null; concrete: string | null };
  bestItem: { itemCode: string; profitPerPp: string; suggestedBonus: number } | null;
  opportunitiesLite: { itemCode: string; profitPerPp: string }[];
  startBalance: number;
  steel: number;
  concrete: number;
};

export type MapGrowthBootstrapInput = {
  recordedAt: string | null;
  prices: Record<string, Decimal | number>;
  opportunities: { itemCode: string; profitPerPp: Decimal | number | null }[];
};

export function mapGrowthBootstrap(input: MapGrowthBootstrapInput): GrowthBootstrapResponse {
  const opportunitiesLite = input.opportunities.flatMap((o) => {
    const pp = typeof o.profitPerPp === "number" ? new Decimal(o.profitPerPp) : o.profitPerPp;
    return isFiniteMoney(pp) ? [{ itemCode: o.itemCode, profitPerPp: serializeMoney(pp)! }] : [];
  });

  const top = opportunitiesLite[0];
  const bestItem = top
    ? {
        itemCode: top.itemCode,
        profitPerPp: top.profitPerPp,
        suggestedBonus: 0,
      }
    : null;

  const steel = input.prices.steel;
  const concrete = input.prices.concrete;
  return {
    recordedAt: input.recordedAt,
    prices: {
      steel: serializeMoney(
        steel == null ? null : typeof steel === "number" ? new Decimal(steel) : steel,
      ),
      concrete: serializeMoney(
        concrete == null ? null : typeof concrete === "number" ? new Decimal(concrete) : concrete,
      ),
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
