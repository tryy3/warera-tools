export {
  MAX_ECO_SKILL_LEVEL,
  maxAffordableLevel,
  spCostForLevel,
  totalSpForLevels,
  totalSpToReachLevel,
} from "./sp";
export { ECO_SKILL_IDS, skillValueFromLevel, type EcoSkillId } from "./values";
export {
  calculateDailyIncome,
  dailyActionsFromBar,
  pickBestSelfWorkCompany,
  type DailyIncomeBreakdown,
  type SkillsCompany,
  type SkillsLevels,
} from "./income";
export { optimizeEcoSkills, type OptimizeMode, type OptimizeResult } from "./optimize";
export {
  fetchIncomeTaxRateForCompany,
  parseIncomeTaxRate,
  parseIncomeTaxRateResult,
  resolveJobWage,
  type IncomeTaxRateResult,
  type SkillsJob,
} from "./job-wage";
