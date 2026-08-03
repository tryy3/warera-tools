import { calculateDailyIncome, type SkillsCompany, type SkillsLevels } from "./income";
import { MAX_ECO_SKILL_LEVEL, spCostForLevel } from "./sp";
import { ECO_SKILL_IDS, skillValueFromLevel } from "./values";

export type OptimizeMode = "unspent" | "full_eco_reset";

export type OptimizeResult = {
  levels: SkillsLevels;
  totalGPerDay: number;
  deltaGPerDay: number;
};

/** Float tie band for full-reset Companies preference. */
const SCORE_NEAR_EQUAL = 1e-9;

function incomeFor(
  levels: SkillsLevels,
  netWage: number,
  companies: SkillsCompany[],
  selfWorkCompanyId?: string | null,
): number {
  return calculateDailyIncome({ levels, netWage, companies, selfWorkCompanyId }).totalGPerDay;
}

export function optimizeEcoSkills(input: {
  mode: OptimizeMode;
  currentLevels: SkillsLevels;
  availableSkillPoints: number;
  totalSkillPoints: number;
  netWage: number;
  companies: SkillsCompany[];
  selfWorkCompanyId?: string | null;
}): OptimizeResult {
  const baselineLevels: SkillsLevels =
    input.mode === "full_eco_reset"
      ? { energy: 0, entrepreneurship: 0, production: 0, companies: 0 }
      : { ...input.currentLevels };

  let budget =
    input.mode === "full_eco_reset" ? input.totalSkillPoints : input.availableSkillPoints;

  const baselineG = incomeFor(
    input.currentLevels,
    input.netWage,
    input.companies,
    input.selfWorkCompanyId,
  );

  let levels = { ...baselineLevels };

  while (budget > 0) {
    let bestSkill: (typeof ECO_SKILL_IDS)[number] | null = null;
    let bestScore = -Infinity;
    let bestCost = 0;

    for (const skill of ECO_SKILL_IDS) {
      const nextLevel = levels[skill] + 1;
      if (nextLevel > MAX_ECO_SKILL_LEVEL) continue;
      const cost = spCostForLevel(nextLevel);
      if (cost <= 0 || cost > budget) continue;
      const trial = { ...levels, [skill]: nextLevel };
      const delta =
        incomeFor(trial, input.netWage, input.companies, input.selfWorkCompanyId) -
        incomeFor(levels, input.netWage, input.companies, input.selfWorkCompanyId);
      const score = delta / cost;

      const better = score > bestScore + SCORE_NEAR_EQUAL;
      const companiesTieBreak =
        input.mode === "full_eco_reset" &&
        skill === "companies" &&
        delta >= 0 &&
        Number.isFinite(bestScore) &&
        Math.abs(score - bestScore) <= SCORE_NEAR_EQUAL &&
        skillValueFromLevel("companies", levels.companies) < input.companies.length;

      if (better || companiesTieBreak) {
        bestScore = score;
        bestSkill = skill;
        bestCost = cost;
      }
    }

    if (bestSkill == null || bestScore <= 0) break;
    levels = { ...levels, [bestSkill]: levels[bestSkill] + 1 };
    budget -= bestCost;
  }

  const totalGPerDay = incomeFor(levels, input.netWage, input.companies, input.selfWorkCompanyId);

  return {
    levels,
    totalGPerDay,
    deltaGPerDay: totalGPerDay - baselineG,
  };
}
