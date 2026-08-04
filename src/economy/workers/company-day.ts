import { dailyActionsFromBar } from "../../skills/income";
import { skillValueFromLevel } from "../../skills/values";
import { explainAeDaily } from "../profit";
import { getRecipe } from "../recipes";
import { maxGrossWagePerPp as maxGrossWagePerPpFromProfit } from "./wages";
import { MAX_FIDELITY_PCT, workerDay, workerDayAtFidelity } from "./worker-day";

export type CompanyDayWorker = {
  id: string;
  energyLevel: number;
  productionLevel: number;
  fidelityPct: number;
  grossWagePerPp: number;
};

export type CompanyDayInput = {
  aeLevel: number;
  productionBonus: number;
  profitPerPp: number;
  itemCode: string | null;
  inputCostPerUnit: number;
  entrepreneurshipLevel: number;
  productionSkillLevel: number;
  includeSelfWork: boolean;
  workers: CompanyDayWorker[];
};

export type CompanyDayResult = {
  aeDailyValue: number;
  aeDailyPp: number;
  selfWorkDailyValue: number;
  selfWorkDailyPp: number;
  workers: Array<{
    id: string;
    current: ReturnType<typeof workerDay>;
    atMaxFidelity: ReturnType<typeof workerDay>;
  }>;
  workerWageCostPerDay: number;
  workerRevenuePerDay: number;
  totalPpPerDay: number;
  unitsProduced: number | null;
  revenuePerDay: number;
  inputCostPerDay: number;
  netPerDay: number;
  netPerDayAtMaxWorkerFidelity: number;
  maxGrossWagePerPp: number;
};

function selfWorkDaily(
  includeSelfWork: boolean,
  entrepreneurshipLevel: number,
  productionSkillLevel: number,
  productionBonus: number,
  profitPerPp: number,
): { selfWorkDailyPp: number; selfWorkDailyValue: number } {
  if (!includeSelfWork) {
    return { selfWorkDailyPp: 0, selfWorkDailyValue: 0 };
  }
  const selfActions = dailyActionsFromBar(
    skillValueFromLevel("entrepreneurship", entrepreneurshipLevel),
  );
  const ppPerAction = skillValueFromLevel("production", productionSkillLevel);
  const selfWorkDailyPp = selfActions * ppPerAction * (1 + productionBonus);
  return {
    selfWorkDailyPp,
    selfWorkDailyValue: selfWorkDailyPp * profitPerPp,
  };
}

function unitsFromPp(itemCode: string | null, totalPp: number): number | null {
  if (itemCode == null) return null;
  const recipe = getRecipe(itemCode);
  if (recipe == null || recipe.consumedPp <= 0) return null;
  return totalPp / recipe.consumedPp;
}

export function companyDay(input: CompanyDayInput): CompanyDayResult {
  const ae = explainAeDaily(input.aeLevel, input.productionBonus, input.profitPerPp);
  const { selfWorkDailyPp, selfWorkDailyValue } = selfWorkDaily(
    input.includeSelfWork,
    input.entrepreneurshipLevel,
    input.productionSkillLevel,
    input.productionBonus,
    input.profitPerPp,
  );

  const workers = input.workers.map((w) => {
    const shared = {
      energyLevel: w.energyLevel,
      productionLevel: w.productionLevel,
      productionBonus: input.productionBonus,
      grossWagePerPp: w.grossWagePerPp,
      profitPerPp: input.profitPerPp,
    };
    return {
      id: w.id,
      current: workerDay({ ...shared, fidelityPct: w.fidelityPct }),
      atMaxFidelity: workerDayAtFidelity(shared, MAX_FIDELITY_PCT),
    };
  });

  let workerWageCostPerDay = 0;
  let workerRevenuePerDay = 0;
  let workerPpPerDay = 0;
  let workerWageAtMax = 0;
  let workerRevenueAtMax = 0;
  let workerPpAtMax = 0;

  for (const w of workers) {
    workerWageCostPerDay += w.current.ownerCostPerDay;
    workerRevenuePerDay += w.current.revenuePerDay;
    workerPpPerDay += w.current.effectivePpPerDay;
    workerWageAtMax += w.atMaxFidelity.ownerCostPerDay;
    workerRevenueAtMax += w.atMaxFidelity.revenuePerDay;
    workerPpAtMax += w.atMaxFidelity.effectivePpPerDay;
  }

  const totalPpPerDay = ae.dailyPp + selfWorkDailyPp + workerPpPerDay;
  const unitsProduced = unitsFromPp(input.itemCode, totalPpPerDay);
  const inputCostPerDay = unitsProduced != null ? unitsProduced * input.inputCostPerUnit : 0;

  // Gross sales = PP×profitPerPp (already net of inputs) + input costs restored for P&L.
  const revenuePerDay = ae.dailyValue + selfWorkDailyValue + workerRevenuePerDay + inputCostPerDay;
  const netPerDay = revenuePerDay - workerWageCostPerDay - inputCostPerDay;

  const totalPpAtMax = ae.dailyPp + selfWorkDailyPp + workerPpAtMax;
  const unitsAtMax = unitsFromPp(input.itemCode, totalPpAtMax);
  const inputCostAtMax = unitsAtMax != null ? unitsAtMax * input.inputCostPerUnit : 0;
  const revenueAtMax = ae.dailyValue + selfWorkDailyValue + workerRevenueAtMax + inputCostAtMax;
  const netPerDayAtMaxWorkerFidelity = revenueAtMax - workerWageAtMax - inputCostAtMax;

  return {
    aeDailyValue: ae.dailyValue,
    aeDailyPp: ae.dailyPp,
    selfWorkDailyValue,
    selfWorkDailyPp,
    workers,
    workerWageCostPerDay,
    workerRevenuePerDay,
    totalPpPerDay,
    unitsProduced,
    revenuePerDay,
    inputCostPerDay,
    netPerDay,
    netPerDayAtMaxWorkerFidelity,
    maxGrossWagePerPp: maxGrossWagePerPpFromProfit(input.profitPerPp, input.productionBonus),
  };
}
