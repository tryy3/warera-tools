import type { CompanyPackEntry } from "../db/company-packs";
import { calculateProfitPerPp } from "../economy/profit";
import { goldPerAePerDayFromProfit } from "../growth/income";
import type { Decimal } from "../money/decimal";
import { isFiniteMoney } from "../money/decimal";
import { calculateDailyIncome, type SkillsCompany, type SkillsLevels } from "../skills/income";
import type { SkillsJob } from "../skills/job-wage";
import { ECO_SKILL_IDS } from "../skills/values";
import type { UserLiteSkills } from "../warera/users";
import type { UserCompany, UserResponse, UserSkill } from "./types";

export type MapUserInput = {
  userId: string;
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  lite: UserLiteSkills;
  job: SkillsJob;
  packEntries: CompanyPackEntry[];
  prices: Record<string, Decimal>;
};

function mapSkills(
  levels: Record<string, number>,
  values: Record<string, number>,
): Record<string, UserSkill> {
  const keys = new Set([...Object.keys(levels), ...Object.keys(values)]);
  const skills: Record<string, UserSkill> = {};
  for (const key of keys) {
    skills[key] = {
      level: levels[key] ?? 0,
      value: values[key] ?? 0,
    };
  }
  return skills;
}

function companyProfitPerPp(itemCode: string | null, prices: Record<string, Decimal>): number {
  if (itemCode == null) return 0;
  const ppp = calculateProfitPerPp(itemCode, prices)?.profitPerPp;
  return isFiniteMoney(ppp) ? ppp.toNumber() : 0;
}

function companyGoldPerAePerDay(profitPerPp: number, productionBonus: number): number {
  if (profitPerPp <= 0 || !Number.isFinite(profitPerPp)) return 0;
  return goldPerAePerDayFromProfit(profitPerPp, productionBonus);
}

function mapCompanies(
  packEntries: CompanyPackEntry[],
  prices: Record<string, Decimal>,
): UserCompany[] {
  return packEntries.map((entry) => {
    const productionBonus = entry.productionBonus ?? 0;
    const profitPerPp = companyProfitPerPp(entry.itemCode, prices);
    return {
      id: entry.id,
      name: entry.name,
      aeLevel: entry.aeLevel,
      itemCode: entry.itemCode,
      productionBonus,
      profitPerPp,
      goldPerAePerDay: companyGoldPerAePerDay(profitPerPp, productionBonus),
    };
  });
}

function ecoLevelsFromSkills(skills: Record<string, UserSkill>): SkillsLevels {
  const levels = {} as SkillsLevels;
  for (const id of ECO_SKILL_IDS) {
    levels[id] = skills[id]?.level ?? 0;
  }
  return levels;
}

function toSkillsCompanies(companies: UserCompany[]): SkillsCompany[] {
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    aeLevel: c.aeLevel,
    productionBonus: c.productionBonus,
    profitPerPp: c.profitPerPp,
  }));
}

export function mapUser(input: MapUserInput): UserResponse {
  const skills = mapSkills(input.lite.skillLevels, input.lite.skillValues);
  const companies = mapCompanies(input.packEntries, input.prices);
  const levels = ecoLevelsFromSkills(skills);
  const income = calculateDailyIncome({
    levels,
    netWage: input.job.netWage ?? 0,
    companies: toSkillsCompanies(companies),
  });

  return {
    userId: input.userId,
    username: input.lite.username,
    recordedAt: input.recordedAt,
    companiesFetchedAt: input.companiesFetchedAt,
    companiesRefreshed: input.companiesRefreshed,
    leveling: input.lite.leveling,
    skills,
    job: input.job,
    companies,
    income,
  };
}
