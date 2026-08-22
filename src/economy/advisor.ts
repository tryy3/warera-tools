import {
  enrichMarketOpportunities,
  explainAeDaily,
  calculateProfitPerPp,
  listMarketOpportunities,
  listProducibleRecipes,
  paybackDays,
  transferCostGold,
  type AeDailyBreakdown,
  type MarketOpportunity,
  type ProfitPpBreakdown,
} from "../economy";
import type { CompanyPackEntry } from "../db/company-packs";
import { buyPriceMap, getLatestPrices, sellPriceMap } from "../db/prices";
import {
  getRecommendedRegionsByItemCodes,
  upsertRecommendedRegion,
} from "../db/recommended-regions";
import { enqueueRegions, getRegionsByIds, upsertRegionFetched } from "../db/regions";
import type { Db } from "../db/client";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import { fetchIncomeTaxRateForCompany } from "../skills/job-wage";
import {
  fetchBestRecommendedRegion,
  fetchRegionInfo,
  type CompanySummary,
  type ProductionBonusDetails,
  type RecommendedRegion,
  type RegionInfo,
} from "../warera/companies";
import type { WareraRequester } from "../warera/prices";
import { fetchUserLiteBatch, type UserLiteSkills } from "../warera/users";
import { fetchWorkOfferWage, fetchWorkers, workerFieldProvenance } from "../warera/workers";
import { loadCompanyPackForUser } from "./load-company-pack";

const WORKER_ENRICH_CHUNK = 3;

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

export type AdvisorWorker = {
  userId: string;
  username: string | null;
  wagePerPp: number | null;
  energyLevel: number | null;
  productionLevel: number | null;
  fidelityPct: number | null;
  /** True when user.getUserLite failed for this worker (skills/name unavailable). */
  enrichmentError: boolean;
};

export type CompanyAdvisorRow = {
  company: CompanySummary;
  bonusDetails: ProductionBonusDetails | null;
  profitBreakdown: ProfitPpBreakdown | null;
  aeBreakdown: AeDailyBreakdown | null;
  currentProfitPerPp: number | null;
  currentDailyValue: number | null;
  bestSwitch: SwitchRecommendation | null;
  workers: AdvisorWorker[];
  workersStatus: "ok" | "unavailable";
  incomeTaxRate: number;
  incomeTaxAssumed: boolean;
  offerWagePerPp: number | null;
};

type CompanyLiveEnrichment = {
  workers: AdvisorWorker[];
  workersStatus: "ok" | "unavailable";
  incomeTaxRate: number;
  incomeTaxAssumed: boolean;
  offerWagePerPp: number | null;
};

const UNAVAILABLE_ENRICHMENT: CompanyLiveEnrichment = {
  workers: [],
  workersStatus: "unavailable",
  incomeTaxRate: 0,
  incomeTaxAssumed: true,
  offerWagePerPp: null,
};

export function mergeWorkersWithUserLite(
  workers: AdvisorWorker[],
  liteByUserId: Map<string, UserLiteSkills | null>,
): AdvisorWorker[] {
  return workers.map((w) => {
    const lite = liteByUserId.get(w.userId);
    if (lite == null) {
      return { ...w, enrichmentError: true };
    }
    return {
      ...w,
      username: lite.username || w.username,
      energyLevel: typeof lite.skillLevels.energy === "number" ? lite.skillLevels.energy : null,
      productionLevel:
        typeof lite.skillLevels.production === "number" ? lite.skillLevels.production : null,
      enrichmentError: false,
    };
  });
}

async function enrichCompanyLive(
  warera: WareraRequester,
  logger: Logger,
  companyId: string,
  probeFirstWorkerKeys: { done: boolean },
): Promise<CompanyLiveEnrichment> {
  const workersPromise = fetchWorkers(
    warera,
    { companyId },
    {
      onFirstRawWorker: ({ keys, sample }) => {
        if (probeFirstWorkerKeys.done) return;
        probeFirstWorkerKeys.done = true;
        logger.debug(
          { keys, sample_json: JSON.stringify(sample) },
          "worker.getWorkers first object keys",
        );
      },
    },
  ).then(
    (workerRows) => {
      logger.debug(
        {
          company_id: companyId,
          worker_count: workerRows.length,
          workers_json: JSON.stringify(
            workerRows.map((w) => ({
              user_id: w.userId,
              username: w.username,
              fields: workerFieldProvenance(w),
            })),
          ),
        },
        "worker field sources from worker.getWorkers",
      );
      return {
        ok: true as const,
        workers: workerRows.map((w) => ({
          userId: w.userId,
          username: w.username,
          wagePerPp: w.wagePerPp,
          energyLevel: w.energyLevel,
          productionLevel: w.productionLevel,
          fidelityPct: w.fidelityPct,
          enrichmentError: false,
        })),
      } as const;
    },
    () => ({ ok: false as const }),
  );

  const offerPromise = fetchWorkOfferWage(warera, companyId).then(
    (offerWagePerPp) => offerWagePerPp,
    () => null,
  );

  const taxPromise = fetchIncomeTaxRateForCompany(warera, companyId).then(
    (incomeTax) => incomeTax,
    () => ({ rate: 0, assumed: true }),
  );

  const [workersResult, offerWagePerPp, incomeTax] = await Promise.all([
    workersPromise,
    offerPromise,
    taxPromise,
  ]);

  if (!workersResult.ok) {
    return {
      ...UNAVAILABLE_ENRICHMENT,
      offerWagePerPp,
      incomeTaxRate: incomeTax.rate,
      incomeTaxAssumed: incomeTax.assumed,
    };
  }

  return {
    workers: workersResult.workers,
    workersStatus: "ok",
    incomeTaxRate: incomeTax.rate,
    incomeTaxAssumed: incomeTax.assumed,
    offerWagePerPp,
  };
}

async function mapInChunks<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

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
  opportunities: MarketOpportunity[];
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

  // Independent Turso / pack work in parallel (one RTT each, overlapped).
  const [latestInitial, packResult, recommendedByItem] = await Promise.all([
    getLatestPrices(db),
    loadCompanyPackForUser({ db, warera, userId, refresh }),
    getRecommendedRegionsByItemCodes(db, recipeCodes),
  ]);

  let latest = latestInitial;
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const bookPrices = {
    buy: latest ? buyPriceMap(latest) : {},
    sell: latest ? sellPriceMap(latest) : {},
  };
  const opportunitiesBase = listMarketOpportunities(bookPrices);
  // Transfer cost: buy concrete at top buy (stock/bid side).
  const concretePrice = bookPrices.buy.concrete ?? bookPrices.sell.concrete ?? 0;

  cacheStats.recommendedHit = recommendedByItem.size;
  cacheStats.recommendedMiss = Math.max(0, recipeCodes.length - recommendedByItem.size);

  const packEntries = packResult.companies;
  const companiesFetchedAt = packResult.fetchedAt;
  const companiesRefreshed = packResult.refreshed;
  cacheStats.companyPack = packResult.refreshed ? (refresh ? "refresh" : "miss") : "hit";

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
      ? calculateProfitPerPp(company.itemCode, bookPrices)
      : null;
    const currentPp = profitBreakdown?.profitPerPp ?? null;
    const aeBreakdown =
      currentPp != null ? explainAeDaily(company.aeLevel, currentBonus, currentPp) : null;
    const currentDaily = aeBreakdown?.dailyValue ?? null;

    let bestSwitch: SwitchRecommendation | null = null;

    for (const recipe of listProducibleRecipes()) {
      const breakdown = calculateProfitPerPp(recipe.itemCode, bookPrices);
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
      ...UNAVAILABLE_ENRICHMENT,
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

  phaseStarted = performance.now();
  const probeFirstWorkerKeys = { done: false };
  const enrichments = await mapInChunks(rows, WORKER_ENRICH_CHUNK, (row) =>
    enrichCompanyLive(warera, logger, row.company.id, probeFirstWorkerKeys),
  );
  for (let i = 0; i < rows.length; i++) {
    Object.assign(rows[i]!, enrichments[i]!);
  }

  const workerUserIds = [
    ...new Set(rows.flatMap((row) => row.workers.map((w) => w.userId)).filter(Boolean)),
  ];
  const liteByUserId =
    workerUserIds.length > 0
      ? await fetchUserLiteBatch(warera, workerUserIds)
      : new Map<string, UserLiteSkills | null>();
  let enrichmentErrorCount = 0;
  for (const row of rows) {
    row.workers = mergeWorkersWithUserLite(row.workers, liteByUserId);
    enrichmentErrorCount += row.workers.filter((w) => w.enrichmentError).length;
  }
  logger.debug(
    {
      worker_user_count: workerUserIds.length,
      enrichment_error_count: enrichmentErrorCount,
    },
    "worker user.getUserLite batch enrich",
  );

  logger.info(
    {
      phase: "workerEnrich",
      durationMs: Math.round(performance.now() - phaseStarted),
      companies: rows.length,
      chunkSize: WORKER_ENRICH_CHUNK,
      worker_user_count: workerUserIds.length,
      enrichment_error_count: enrichmentErrorCount,
    },
    "advisor",
  );

  for (const o of opportunitiesBase) {
    if (!bestRegionCache.has(o.itemCode)) {
      await bestRegion(o.itemCode);
    }
  }

  const regionHints = new Map<
    string,
    { regionId: string; regionName: string | null; bonus: number | null }
  >();
  for (const [itemCode, row] of recommendedByItem) {
    regionHints.set(itemCode, {
      regionId: row.regionId,
      regionName: row.regionName,
      bonus: row.bonus,
    });
  }
  for (const [itemCode, region] of bestRegionCache) {
    if (region == null) continue;
    const existing = regionHints.get(itemCode);
    // Prefer DB row (preserves null bonus). Only add live-fetched items absent from DB.
    if (existing) continue;
    regionHints.set(itemCode, {
      regionId: region.regionId,
      regionName: region.regionName,
      bonus: region.bonus,
    });
  }
  const opportunities = enrichMarketOpportunities(opportunitiesBase, regionHints);

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
