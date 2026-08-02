import type { CompanyPackEntry } from "../db/company-packs";
import type { Db } from "../db/client";
import { getLatestPrices, marketPriceMap } from "../db/prices";
import { loadCompanyPackForUser } from "../economy/load-company-pack";
import { calculateProfitPerPp, listMarketOpportunities } from "../economy/profit";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "../warera/prices";
import { goldPerAePerDayFromProfit } from "./income";

export type GrowthBootstrapCompany = {
  id: string;
  name: string;
  aeLevel: number;
  itemCode: string | null;
  productionBonus: number | null;
  goldPerAePerDay: number;
};

export type GrowthBootstrapResponse = {
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  companies: GrowthBootstrapCompany[];
  prices: { steel: number | null; concrete: number | null };
  bestItem: { itemCode: string; profitPerPp: number; suggestedBonus: number } | null;
  opportunitiesLite: { itemCode: string; profitPerPp: number }[];
  startBalance: number;
  steel: number;
  concrete: number;
};

export type MapGrowthBootstrapInput = {
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  packEntries: CompanyPackEntry[];
  prices: Record<string, number>;
  opportunities: { itemCode: string; profitPerPp: number | null }[];
};

function averageNonNullBonus(entries: CompanyPackEntry[]): number {
  let sum = 0;
  let count = 0;
  for (const entry of entries) {
    if (entry.productionBonus != null) {
      sum += entry.productionBonus;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function mapGrowthBootstrap(input: MapGrowthBootstrapInput): GrowthBootstrapResponse {
  const opportunitiesLite = input.opportunities.flatMap((o) =>
    o.profitPerPp != null && Number.isFinite(o.profitPerPp)
      ? [{ itemCode: o.itemCode, profitPerPp: o.profitPerPp }]
      : [],
  );

  const suggestedBonus = averageNonNullBonus(input.packEntries);
  const top = opportunitiesLite[0];
  const bestItem = top
    ? {
        itemCode: top.itemCode,
        profitPerPp: top.profitPerPp,
        suggestedBonus,
      }
    : null;

  const profitByItem = new Map(opportunitiesLite.map((o) => [o.itemCode, o.profitPerPp]));

  const companies: GrowthBootstrapCompany[] = input.packEntries.map((entry) => {
    const bonus = entry.productionBonus;
    const ppp =
      entry.itemCode != null
        ? (profitByItem.get(entry.itemCode) ??
          calculateProfitPerPp(entry.itemCode, input.prices)?.profitPerPp ??
          null)
        : null;
    const goldPerAePerDay =
      entry.itemCode != null && bonus != null && ppp != null && Number.isFinite(ppp)
        ? goldPerAePerDayFromProfit(ppp, bonus)
        : 0;

    return {
      id: entry.id,
      name: entry.name,
      aeLevel: entry.aeLevel,
      itemCode: entry.itemCode,
      productionBonus: entry.productionBonus,
      goldPerAePerDay,
    };
  });

  return {
    recordedAt: input.recordedAt,
    companiesFetchedAt: input.companiesFetchedAt,
    companiesRefreshed: input.companiesRefreshed,
    companies,
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
  const { db, warera, logger, userId, refresh = false } = options;

  const [latestInitial, packResult] = await Promise.all([
    getLatestPrices(db),
    loadCompanyPackForUser({ db, warera, userId, refresh }),
  ]);

  let latest = latestInitial;
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const prices = latest ? marketPriceMap(latest) : {};
  const opportunities = listMarketOpportunities(prices);

  return mapGrowthBootstrap({
    recordedAt: latest?.recordedAt.toISOString() ?? null,
    companiesFetchedAt: packResult.fetchedAt,
    companiesRefreshed: packResult.refreshed,
    packEntries: packResult.companies,
    prices,
    opportunities,
  });
}
