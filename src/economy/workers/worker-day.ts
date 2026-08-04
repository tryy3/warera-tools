import { dailyActionsFromBar } from "../../skills/income";
import { skillValueFromLevel } from "../../skills/values";

export const MAX_FIDELITY_PCT = 10;

export type WorkerDayInput = {
  energyLevel: number;
  productionLevel: number;
  productionBonus: number;
  fidelityPct: number;
  grossWagePerPp: number;
  profitPerPp: number;
};

export type WorkerDayResult = {
  actionsPerDay: number;
  ppPerAction: number;
  basePpPerDay: number;
  effectivePpPerDay: number;
  revenuePerDay: number;
  ownerCostPerDay: number;
  contributionPerDay: number;
};

export function workerDay(input: WorkerDayInput): WorkerDayResult {
  const actionsPerDay = dailyActionsFromBar(skillValueFromLevel("energy", input.energyLevel));
  const ppPerAction = skillValueFromLevel("production", input.productionLevel);
  const basePpPerDay = actionsPerDay * ppPerAction;
  const effectivePpPerDay =
    basePpPerDay * (1 + input.productionBonus) * (1 + input.fidelityPct / 100);
  const revenuePerDay = effectivePpPerDay * input.profitPerPp;
  const ownerCostPerDay = effectivePpPerDay * input.grossWagePerPp;
  const contributionPerDay = revenuePerDay - ownerCostPerDay;

  return {
    actionsPerDay,
    ppPerAction,
    basePpPerDay,
    effectivePpPerDay,
    revenuePerDay,
    ownerCostPerDay,
    contributionPerDay,
  };
}

export function workerDayAtFidelity(
  input: Omit<WorkerDayInput, "fidelityPct">,
  fidelityPct: number,
): WorkerDayResult {
  return workerDay({ ...input, fidelityPct });
}
