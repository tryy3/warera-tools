import type { CompanyPackEntry } from "../db/company-packs";
import type { Db } from "../db/client";
import { getLatestPrices, marketPriceMap } from "../db/prices";
import { loadCompanyPackForUser } from "../economy/load-company-pack";
import { calculateProfitPerPp } from "../economy/profit";
import { runPricePoll } from "../jobs/price-poll/run";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "../warera/prices";
import type { UserLiteSkills } from "../warera/users";
import { fetchUserLite } from "../warera/users";
import { resolveJobWage, type SkillsJob } from "./job-wage";

export type SkillsBootstrapCompany = {
  id: string;
  name: string;
  aeLevel: number;
  itemCode: string | null;
  productionBonus: number;
  profitPerPp: number;
};

export type SkillsBootstrapSkill = {
  level: number;
  value: number;
};

export type SkillsBootstrapResponse = {
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  leveling: UserLiteSkills["leveling"];
  skills: Record<string, SkillsBootstrapSkill>;
  companies: SkillsBootstrapCompany[];
  job: SkillsJob;
};

export type MapSkillsBootstrapInput = {
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  packEntries: CompanyPackEntry[];
  prices: Record<string, number>;
  lite: UserLiteSkills;
  job: SkillsJob;
};

function mapSkills(
  levels: Record<string, number>,
  values: Record<string, number>,
): Record<string, SkillsBootstrapSkill> {
  const keys = new Set([...Object.keys(levels), ...Object.keys(values)]);
  const skills: Record<string, SkillsBootstrapSkill> = {};
  for (const key of keys) {
    skills[key] = {
      level: levels[key] ?? 0,
      value: values[key] ?? 0,
    };
  }
  return skills;
}

function companyProfitPerPp(
  itemCode: string | null,
  prices: Record<string, number>,
): number {
  if (itemCode == null) return 0;
  const ppp = calculateProfitPerPp(itemCode, prices)?.profitPerPp;
  return ppp != null && Number.isFinite(ppp) ? ppp : 0;
}

export function mapSkillsBootstrap(input: MapSkillsBootstrapInput): SkillsBootstrapResponse {
  const companies: SkillsBootstrapCompany[] = input.packEntries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    aeLevel: entry.aeLevel,
    itemCode: entry.itemCode,
    productionBonus: entry.productionBonus ?? 0,
    profitPerPp: companyProfitPerPp(entry.itemCode, input.prices),
  }));

  return {
    recordedAt: input.recordedAt,
    companiesFetchedAt: input.companiesFetchedAt,
    companiesRefreshed: input.companiesRefreshed,
    leveling: input.lite.leveling,
    skills: mapSkills(input.lite.skillLevels, input.lite.skillValues),
    companies,
    job: input.job,
  };
}

export async function buildSkillsBootstrap(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  userId: string;
  refresh?: boolean;
}): Promise<SkillsBootstrapResponse> {
  const { db, warera, logger, userId, refresh = false } = options;

  const [latestInitial, packResult, lite, job] = await Promise.all([
    getLatestPrices(db),
    loadCompanyPackForUser({ db, warera, userId, refresh }),
    fetchUserLite(warera, userId),
    resolveJobWage(warera, userId),
  ]);

  let latest = latestInitial;
  if (!latest) {
    await runPricePoll({ db, warera, logger });
    latest = await getLatestPrices(db);
  }
  const prices = latest ? marketPriceMap(latest) : {};

  return mapSkillsBootstrap({
    recordedAt: latest?.recordedAt.toISOString() ?? null,
    companiesFetchedAt: packResult.fetchedAt,
    companiesRefreshed: packResult.refreshed,
    packEntries: packResult.companies,
    prices,
    lite,
    job,
  });
}
