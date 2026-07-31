import {
  explainAeDaily,
  calculateProfitPerPp,
  listMarketOpportunities,
  listProducibleRecipes,
  paybackDays,
  transferCostGold,
  type AeDailyBreakdown,
  type ProfitPpBreakdown,
} from "../economy";
import { getLatestPrices, marketPriceMap } from "../db/prices";
import type { Db } from "../db/client";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import {
  fetchBestRecommendedRegion,
  fetchCompaniesByUserId,
  fetchCompanyProductionBonus,
  fetchRegionName,
  type CompanySummary,
  type ProductionBonusDetails,
} from "../warera/companies";
import type { WareraRequester } from "../warera/prices";

export type SwitchRecommendation = {
  itemCode: string;
  bestRegionId: string | null;
  bestRegionName: string | null;
  bestBonus: number;
  profitPerPp: number;
  dailyValue: number;
  dailyDelta: number;
  retask: boolean;
  relocate: boolean;
  transferConcrete: number;
  transferGold: number;
  paybackDays: number | null;
  profitFormula: string;
  aeFormula: string;
  transferFormula: string;
  paybackFormula: string | null;
};

export type CompanyAdvisorRow = {
  company: CompanySummary;
  bonusDetails: ProductionBonusDetails | null;
  profitBreakdown: ProfitPpBreakdown | null;
  aeBreakdown: AeDailyBreakdown | null;
  currentProfitPerPp: number | null;
  currentDailyValue: number | null;
  bestSwitch: SwitchRecommendation | null;
};

export async function buildAdvisor(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  userId: string;
}): Promise<{
  recordedAt: string | null;
  opportunities: ProfitPpBreakdown[];
  companies: CompanyAdvisorRow[];
}> {
  const { db, warera, logger, userId } = options;

  let latest = await getLatestPrices(db);
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const prices = latest ? marketPriceMap(latest) : {};
  const opportunities = listMarketOpportunities(prices);
  const concretePrice = prices.concrete ?? 0;

  let companies = await fetchCompaniesByUserId(warera, userId);

  const regionNameCache = new Map<string, string | null>();
  async function regionName(regionId: string | null): Promise<string | null> {
    if (!regionId) return null;
    if (regionNameCache.has(regionId)) return regionNameCache.get(regionId)!;
    const name = await fetchRegionName(warera, regionId);
    regionNameCache.set(regionId, name);
    return name;
  }

  const enriched = await Promise.all(
    companies.map(async (c) => {
      const bonusDetails =
        c.productionBonus != null ? null : await fetchCompanyProductionBonus(warera, c.id);
      const productionBonus = bonusDetails?.total ?? c.productionBonus;
      const name = c.regionName ?? (await regionName(c.regionId));
      return {
        company: {
          ...c,
          regionName: name,
          productionBonus: productionBonus ?? null,
        },
        bonusDetails,
      };
    }),
  );

  const bestRegionCache = new Map<string, Awaited<ReturnType<typeof fetchBestRecommendedRegion>>>();

  async function bestRegion(itemCode: string) {
    if (bestRegionCache.has(itemCode)) return bestRegionCache.get(itemCode)!;
    try {
      const region = await fetchBestRecommendedRegion(warera, itemCode);
      bestRegionCache.set(itemCode, region);
      return region;
    } catch (err) {
      logger.warn(
        { itemCode, err: err instanceof Error ? err.message : String(err) },
        "recommended region fetch failed",
      );
      bestRegionCache.set(itemCode, null);
      return null;
    }
  }

  const rows: CompanyAdvisorRow[] = [];
  for (const { company, bonusDetails } of enriched) {
    const currentBonus = company.productionBonus ?? 0;
    const profitBreakdown = company.itemCode
      ? calculateProfitPerPp(company.itemCode, prices)
      : null;
    const currentPp = profitBreakdown?.profitPerPp ?? null;
    const aeBreakdown =
      currentPp != null ? explainAeDaily(company.aeLevel, currentBonus, currentPp) : null;
    const currentDaily = aeBreakdown?.dailyValue ?? null;

    let bestSwitch: SwitchRecommendation | null = null;

    for (const recipe of listProducibleRecipes()) {
      const breakdown = calculateProfitPerPp(recipe.itemCode, prices);
      if (breakdown?.profitPerPp == null) continue;

      const region = await bestRegion(recipe.itemCode);
      // Prefer recommended-region bonus; if unavailable, compare retask at current bonus.
      const bonus = region?.bonus ?? currentBonus;
      const ae = explainAeDaily(company.aeLevel, bonus, breakdown.profitPerPp);
      const dailyValue = ae.dailyValue;
      const dailyDelta = currentDaily == null ? dailyValue : dailyValue - currentDaily;

      const retask = company.itemCode != null && company.itemCode !== recipe.itemCode;
      const relocate =
        region != null && company.regionId != null && region.regionId !== company.regionId;
      const assumeRelocate = region != null && (company.regionId == null || relocate);
      const needsRetask = company.itemCode == null || retask;
      const needsRelocate = assumeRelocate;

      // Without a recommended region, only consider material retask in place.
      if (region == null && !needsRetask) continue;
      if (region == null && needsRelocate) continue;
      if (!needsRetask && !needsRelocate) continue;
      if (!(dailyDelta > 0.0001)) continue;

      const transfer = transferCostGold(concretePrice, {
        retask: needsRetask,
        relocate: needsRelocate,
      });
      const days = paybackDays(transfer.gold, dailyDelta);
      const candidate: SwitchRecommendation = {
        itemCode: recipe.itemCode,
        bestRegionId: region?.regionId ?? null,
        bestRegionName: region?.regionName ?? null,
        bestBonus: bonus,
        profitPerPp: breakdown.profitPerPp,
        dailyValue,
        dailyDelta,
        retask: needsRetask,
        relocate: needsRelocate,
        transferConcrete: transfer.concreteUnits,
        transferGold: transfer.gold,
        paybackDays: days,
        profitFormula: breakdown.formula,
        aeFormula: ae.formula,
        transferFormula: transfer.formula,
        paybackFormula:
          days == null ? null : `${transfer.gold} G transfer ÷ ${dailyDelta} G/day delta`,
      };

      if (
        !bestSwitch ||
        candidate.dailyDelta > bestSwitch.dailyDelta ||
        (candidate.dailyDelta === bestSwitch.dailyDelta &&
          (candidate.paybackDays ?? Infinity) < (bestSwitch.paybackDays ?? Infinity))
      ) {
        bestSwitch = candidate;
      }
    }

    rows.push({
      company,
      bonusDetails:
        bonusDetails ??
        (company.productionBonus != null
          ? {
              total: company.productionBonus,
              strategicBonus: 0,
              depositBonus: 0,
              ethicSpecializationBonus: 0,
              ethicDepositBonus: 0,
              formula: `total ${company.productionBonus * 100}%`,
            }
          : null),
      profitBreakdown,
      aeBreakdown,
      currentProfitPerPp: currentPp,
      currentDailyValue: currentDaily,
      bestSwitch,
    });
  }

  return {
    recordedAt: latest?.recordedAt.toISOString() ?? null,
    opportunities,
    companies: rows,
  };
}
