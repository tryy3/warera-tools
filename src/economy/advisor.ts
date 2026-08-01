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
import {
  getRecommendedRegionsByItemCodes,
  upsertRecommendedRegion,
} from "../db/recommended-regions";
import { enqueueRegions, getRegionsByIds, upsertRegionFetched } from "../db/regions";
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
  const recipeCodes = listProducibleRecipes().map((r) => r.itemCode);

  // Independent Turso reads in parallel (one RTT each, overlapped).
  const [latestInitial, existingPack, recommendedByItem] = await Promise.all([
    getLatestPrices(db),
    getCompanyPack(db, userId),
    getRecommendedRegionsByItemCodes(db, recipeCodes),
  ]);

  let latest = latestInitial;
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const prices = latest ? marketPriceMap(latest) : {};
  const opportunities = listMarketOpportunities(prices);
  const concretePrice = prices.concrete ?? 0;

  cacheStats.recommendedHit = recommendedByItem.size;
  cacheStats.recommendedMiss = Math.max(0, recipeCodes.length - recommendedByItem.size);

  let companiesRefreshed = false;
  let companiesFetchedAt: number | null = null;
  let packEntries: CompanyPackEntry[];

  const packFresh =
    existingPack != null && isCompanyPackFresh(existingPack.fetchedAt, existingPack.ttlSeconds);

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
    await enqueueRegions(
      db,
      enrichedLive.flatMap((e) => (e.regionId ? [e.regionId] : [])),
      fetchedAt,
    );
    packEntries = enrichedLive;
    companiesFetchedAt = fetchedAt.getTime();
    companiesRefreshed = true;
  }

  logger.info(
    {
      phase: "bootstrap",
      durationMs: Math.round(performance.now() - phaseStarted),
      companyPack: cacheStats.companyPack,
      companies: packEntries.length,
      recommendedHit: cacheStats.recommendedHit,
      recommendedMiss: cacheStats.recommendedMiss,
    },
    "advisor",
  );

  phaseStarted = performance.now();
  const regionIdsNeeded = new Set<string>();
  for (const entry of packEntries) {
    if (entry.regionId) regionIdsNeeded.add(entry.regionId);
  }
  for (const row of recommendedByItem.values()) {
    regionIdsNeeded.add(row.regionId);
  }

  const regionsById = await getRegionsByIds(db, [...regionIdsNeeded]);
  const missingRegionIds = [...regionIdsNeeded].filter((id) => !regionsById.has(id));
  if (missingRegionIds.length > 0) {
    await enqueueRegions(db, missingRegionIds);
  }

  const regionInfoCache = new Map<string, RegionInfo>();
  for (const [id, row] of regionsById) {
    if (row.fetchedAt != null) {
      cacheStats.regionHit += 1;
      regionInfoCache.set(id, { name: row.name, countryCode: row.countryCode });
    }
  }

  const bestRegionCache = new Map<string, RecommendedRegion | null>();
  for (const [itemCode, row] of recommendedByItem) {
    bestRegionCache.set(itemCode, {
      regionId: row.regionId,
      regionName: row.regionName,
      bonus: row.bonus ?? 0,
    });
  }

  logger.info(
    {
      phase: "prefetchRegions",
      durationMs: Math.round(performance.now() - phaseStarted),
      regionsCached: regionInfoCache.size,
      regionIds: regionIdsNeeded.size,
      regionsEnqueued: missingRegionIds.length,
    },
    "advisor",
  );

  async function regionInfo(regionId: string | null): Promise<RegionInfo> {
    if (!regionId) return { name: null, countryCode: null };
    if (regionInfoCache.has(regionId)) return regionInfoCache.get(regionId)!;

    cacheStats.regionMiss += 1;
    cacheStats.regionLiveFetch += 1;
    const info = await fetchRegionInfo(warera, regionId);
    const now = new Date();
    await enqueueRegions(db, [regionId], now);
    await upsertRegionFetched(db, {
      id: regionId,
      name: info.name,
      countryCode: info.countryCode,
      fetchedAt: now,
    });
    regionInfoCache.set(regionId, info);
    return info;
  }

  async function bestRegion(itemCode: string): Promise<RecommendedRegion | null> {
    if (bestRegionCache.has(itemCode)) return bestRegionCache.get(itemCode)!;

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
        await enqueueRegions(db, [region.regionId], now);
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
