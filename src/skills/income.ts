import { aeDailyValue } from "../economy/profit";
import { type EcoSkillId, skillValueFromLevel } from "./values";

export type SkillsLevels = Record<EcoSkillId, number>;

export type SkillsCompany = {
  id: string;
  name: string;
  aeLevel: number;
  productionBonus: number;
  profitPerPp: number;
};

export type DailyIncomeBreakdown = {
  workGPerDay: number;
  selfWorkGPerDay: number;
  aeGPerDay: number;
  totalGPerDay: number;
  workActionsPerDay: number;
  selfWorkActionsPerDay: number;
  ppPerAction: number;
  activeSlots: number;
  selfWorkCompanyId: string | null;
  aeCompanyIds: string[];
};

export function dailyActionsFromBar(value: number): number {
  return (value / 10) * 2.4;
}

function selfWorkGPerDayFor(
  company: SkillsCompany,
  selfWorkActions: number,
  ppPerAction: number,
): number {
  return selfWorkActions * ppPerAction * (1 + company.productionBonus) * company.profitPerPp;
}

export function pickBestSelfWorkCompany(
  companies: SkillsCompany[],
  productionValue: number,
): SkillsCompany | null {
  if (companies.length === 0) return null;
  // productionValue only scales all equally; pick by (1+bonus)*profitPerPp
  let best = companies[0]!;
  let bestScore = (1 + best.productionBonus) * best.profitPerPp;
  for (let i = 1; i < companies.length; i++) {
    const c = companies[i]!;
    const score = (1 + c.productionBonus) * c.profitPerPp;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  void productionValue;
  return best;
}

export function calculateDailyIncome(input: {
  levels: SkillsLevels;
  netWage: number;
  companies: SkillsCompany[];
  selfWorkCompanyId?: string | null;
}): DailyIncomeBreakdown {
  const energy = skillValueFromLevel("energy", input.levels.energy);
  const entre = skillValueFromLevel("entrepreneurship", input.levels.entrepreneurship);
  const prod = skillValueFromLevel("production", input.levels.production);
  const companiesValue = skillValueFromLevel("companies", input.levels.companies);

  const workActionsPerDay = dailyActionsFromBar(energy);
  const selfWorkActionsPerDay = dailyActionsFromBar(entre);
  const ppPerAction = prod;

  const workGPerDay = workActionsPerDay * ppPerAction * Math.max(0, input.netWage);

  let selfCompany =
    input.selfWorkCompanyId != null
      ? (input.companies.find((c) => c.id === input.selfWorkCompanyId) ?? null)
      : null;
  if (!selfCompany) {
    selfCompany = pickBestSelfWorkCompany(input.companies, prod);
  }

  const selfWorkGPerDay = selfCompany
    ? selfWorkGPerDayFor(selfCompany, selfWorkActionsPerDay, ppPerAction)
    : 0;

  const ranked = input.companies
    .map((c) => ({
      id: c.id,
      daily: aeDailyValue(c.aeLevel, c.productionBonus, c.profitPerPp),
    }))
    .toSorted((a, b) => b.daily - a.daily);

  const activeSlots = Math.min(companiesValue, input.companies.length);
  const selected = ranked.slice(0, activeSlots);
  const aeGPerDay = selected.reduce((s, x) => s + x.daily, 0);

  return {
    workGPerDay,
    selfWorkGPerDay,
    aeGPerDay,
    totalGPerDay: workGPerDay + selfWorkGPerDay + aeGPerDay,
    workActionsPerDay,
    selfWorkActionsPerDay,
    ppPerAction,
    activeSlots,
    selfWorkCompanyId: selfCompany?.id ?? null,
    aeCompanyIds: selected.map((x) => x.id),
  };
}
