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
import {
  getCompanyPack,
  isCompanyPackFresh,
  upsertCompanyPack,
  type CompanyPackEntry,
} from "../db/company-packs";
import { getLatestPrices, marketPriceMap } from "../db/prices";
import { getRecommendedRegion, upsertRecommendedRegion } from "../db/recommended-regions";
import { enqueueRegion, getRegion, upsertRegionFetched } from "../db/regions";
import type { Db } from "../db/client";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import {
  fetchBestRecommendedRegion,
  fetchCompaniesByUserId,
  fetchCompanyProductionBonus,
  fetchRegionInfo,
  type CompanySummary,
  type ProductionBonusDetails,
  type RecommendedRegion,
  type RegionInfo,
} from "../warera/companies";
import type { WareraRequester } from "../warera/prices";

export type SwitchRecommendation = {
  itemCode: string;
  bestRegionId: string | null;
  bestRegionName: string | null;
  bestRegionCountryCode: string | null;
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

function entryToCompany(entry: CompanyPackEntry): {
  company: CompanySummary;
  bonusDetails: ProductionBonusDetails | null;
} {
  return {
    company: {
      id: entry.id,
      name: entry.name,
      itemCode: entry.itemCode,
      regionId: entry.regionId,
      regionName: null,
      regionCountryCode: null,
      aeLevel: entry.aeLevel,
      productionBonus: entry.productionBonus,
    },
    bonusDetails: entry.bonusDetails,
  };
}

export async function buildAdvisor(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  userId: string;
  refresh?: boolean;
}): Promise<{
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  opportunities: ProfitPpBreakdown[];
  companies: CompanyAdvisorRow[];
}> {
  const { db, warera, logger, userId, refresh = false } = options;
  const advisorStarted = performance.now();
  const cacheStats = {
    companyPack: "miss" as "hit" | "miss" | "refresh",
    recommendedHit: 0,
    recommendedMiss: 0,
    regionHit: 0,
    regionMiss: 0,
    regionLiveFetch: 0,
  };

  let phaseStarted = performance.now();
  let latest = await getLatestPrices(db);
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const prices = latest ? marketPriceMap(latest) : {};
  const opportunities = listMarketOpportunities(prices);
  const concretePrice = prices.concrete ?? 0;
  logger.info(
    { phase: "prices", durationMs: Math.round(performance.now() - phaseStarted) },
    "advisor",
  );

  phaseStarted = performance.now();
  const existingPack = await getCompanyPack(db, userId);
  const packFresh =
    existingPack != null && isCompanyPackFresh(existingPack.fetchedAt, existingPack.ttlSeconds);
  let companiesRefreshed = false;
  let companiesFetchedAt: number | null = null;
  let packEntries: CompanyPackEntry[];

  if (!refresh && packFresh && existingPack) {
    packEntries = existingPack.companies;
    companiesFetchedAt = existingPack.fetchedAt.getTime();
    cacheStats.companyPack = "hit";
  } else {
    cacheStats.companyPack = refresh ? "refresh" : "miss";
    const live = await fetchCompaniesByUserId(warera, userId);
    const enrichedLive = await Promise.all(
      live.map(async (c) => {
        const bonusDetails =
          c.productionBonus != null ? null : await fetchCompanyProductionBonus(warera, c.id);
        const productionBonus = bonusDetails?.total ?? c.productionBonus ?? null;
        return {
          id: c.id,
          name: c.name,
          itemCode: c.itemCode,
          regionId: c.regionId,
          aeLevel: c.aeLevel,
          productionBonus,
          bonusDetails:
            bonusDetails ??
            (productionBonus != null
              ? {
                  total: productionBonus,
                  strategicBonus: 0,
                  depositBonus: 0,
                  ethicSpecializationBonus: 0,
                  ethicDepositBonus: 0,
                  formula: `total ${productionBonus * 100}%`,
                }
              : null),
        } satisfies CompanyPackEntry;
      }),
    );
    const fetchedAt = new Date();
    await upsertCompanyPack(db, { userId, companies: enrichedLive, fetchedAt });
    for (const entry of enrichedLive) {
      if (entry.regionId) await enqueueRegion(db, entry.regionId, fetchedAt);
    }
    packEntries = enrichedLive;
    companiesFetchedAt = fetchedAt.getTime();
    companiesRefreshed = true;
  }
  logger.info(
    {
      phase: "companyPack",
      durationMs: Math.round(performance.now() - phaseStarted),
      cache: cacheStats.companyPack,
      companies: packEntries.length,
    },
    "advisor",
  );

  const regionInfoCache = new Map<string, RegionInfo>();
  async function regionInfo(regionId: string | null): Promise<RegionInfo> {
    if (!regionId) return { name: null, countryCode: null };
    if (regionInfoCache.has(regionId)) return regionInfoCache.get(regionId)!;

    const cached = await getRegion(db, regionId);
    if (cached?.fetchedAt != null) {
      cacheStats.regionHit += 1;
      const info = { name: cached.name, countryCode: cached.countryCode };
      regionInfoCache.set(regionId, info);
      return info;
    }

    cacheStats.regionMiss += 1;
    cacheStats.regionLiveFetch += 1;
    const info = await fetchRegionInfo(warera, regionId);
    const now = new Date();
    await enqueueRegion(db, regionId, now);
    await upsertRegionFetched(db, {
      id: regionId,
      name: info.name,
      countryCode: info.countryCode,
      fetchedAt: now,
    });
    regionInfoCache.set(regionId, info);
    return info;
  }

  const bestRegionCache = new Map<string, RecommendedRegion | null>();

  async function bestRegion(itemCode: string): Promise<RecommendedRegion | null> {
    if (bestRegionCache.has(itemCode)) return bestRegionCache.get(itemCode)!;

    const cached = await getRecommendedRegion(db, itemCode);
    if (cached) {
      cacheStats.recommendedHit += 1;
      const region: RecommendedRegion = {
        regionId: cached.regionId,
        regionName: cached.regionName,
        bonus: cached.bonus ?? 0,
      };
      bestRegionCache.set(itemCode, region);
      await enqueueRegion(db, region.regionId);
      return region;
    }

    cacheStats.recommendedMiss += 1;
    try {
      const region = await fetchBestRecommendedRegion(warera, itemCode);
      if (region) {
        const now = new Date();
        await upsertRecommendedRegion(db, {
          itemCode,
          regionId: region.regionId,
          regionName: region.regionName,
          bonus: region.bonus,
          payload: {
            regionId: region.regionId,
            regionName: region.regionName,
            bonus: region.bonus,
          },
          fetchedAt: now,
        });
        await enqueueRegion(db, region.regionId, now);
      }
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

  phaseStarted = performance.now();

  const rows: CompanyAdvisorRow[] = [];
  for (const entry of packEntries) {
    const { company: baseCompany, bonusDetails } = entryToCompany(entry);
    const info = await regionInfo(baseCompany.regionId);
    const company: CompanySummary = {
      ...baseCompany,
      regionName: info.name,
      regionCountryCode: info.countryCode,
    };

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

      if (region == null && !needsRetask) continue;
      if (region == null && needsRelocate) continue;
      if (!needsRetask && !needsRelocate) continue;
      if (!(dailyDelta > 0.0001)) continue;

      const transfer = transferCostGold(concretePrice, {
        retask: needsRetask,
        relocate: needsRelocate,
      });
      const days = paybackDays(transfer.gold, dailyDelta);
      const bestRegionId = region?.regionId ?? null;
      const bestInfo = await regionInfo(bestRegionId);
      const candidate: SwitchRecommendation = {
        itemCode: recipe.itemCode,
        bestRegionId,
        bestRegionName: region?.regionName ?? bestInfo.name,
        bestRegionCountryCode: bestInfo.countryCode,
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
      bonusDetails,
      profitBreakdown,
      aeBreakdown,
      currentProfitPerPp: currentPp,
      currentDailyValue: currentDaily,
      bestSwitch,
    });
  }

  logger.info(
    {
      phase: "switchScan",
      durationMs: Math.round(performance.now() - phaseStarted),
      companies: packEntries.length,
      ...cacheStats,
    },
    "advisor",
  );

  logger.info(
    {
      phase: "total",
      durationMs: Math.round(performance.now() - advisorStarted),
      ...cacheStats,
    },
    "advisor",
  );

  return {
    recordedAt: latest?.recordedAt.toISOString() ?? null,
    companiesFetchedAt,
    companiesRefreshed,
    opportunities,
    companies: rows,
  };
}
