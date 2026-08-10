import type { BookPrices } from "../../../../economy/profit";
import {
  companyDay,
  type CompanyDayResult,
  wagePair,
  type WagePair,
} from "../../../../economy/workers";
import { effectiveProfitForItem } from "../sessionPrices/effective";
import type { CompanyAdvisorRow } from "../types";
import type { CompanyOverrides, CompanySimState, SimWorker } from "./types";

export type DerivedCompanyCard = {
  companyId: string;
  dirty: boolean;
  workersStatus: "ok" | "unavailable";
  incomeTaxRate: number;
  incomeTaxAssumed: boolean;
  activeWorkerCount: number;
  /** Effective Profit/PP after session buy/sell overrides. */
  profitPerPp: number;
  day: CompanyDayResult;
  offerWage: WagePair | null;
  maxWage: WagePair;
};

type OwnerDefaults = {
  entrepreneurshipLevel: number;
  productionSkillLevel: number;
};

function assignedWorkers(state: CompanySimState, companyId: string): SimWorker[] {
  return state.workers.filter((w) => w.assignment === companyId);
}

/** Workers that contribute to company day math (error rows need a manual edit first). */
export function workersIncludedInTotals(workers: SimWorker[]): SimWorker[] {
  return workers.filter((w) => !w.enrichmentError || w.dirty);
}

function isDirty(overrides: CompanyOverrides | undefined, assigned: SimWorker[]): boolean {
  if (overrides != null && Object.keys(overrides).length > 0) return true;
  return assigned.some((w) => w.dirty || w.kind === "simulated");
}

function resolveProfitPerPp(row: CompanyAdvisorRow): number {
  return row.currentProfitPerPp ?? row.profitBreakdown?.profitPerPp ?? 0;
}

function resolveInputCostPerUnit(row: CompanyAdvisorRow): number {
  const breakdown = row.profitBreakdown;
  if (breakdown == null) return 0;
  return Number.isFinite(breakdown.inputCost) ? breakdown.inputCost : 0;
}

export function deriveCompanyCard(
  row: CompanyAdvisorRow,
  state: CompanySimState,
  ownerDefaults: OwnerDefaults,
  book?: BookPrices,
): DerivedCompanyCard {
  const companyId = row.company.id;
  const overrides = state.overrides[companyId];
  const assigned = assignedWorkers(state, companyId);
  const included = workersIncludedInTotals(assigned);

  const aeLevel = overrides?.aeLevel ?? row.company.aeLevel;
  const productionBonus = overrides?.productionBonus ?? row.company.productionBonus ?? 0;
  const entrepreneurshipLevel =
    overrides?.entrepreneurshipLevel ?? ownerDefaults.entrepreneurshipLevel;
  const productionSkillLevel =
    overrides?.productionSkillLevel ?? ownerDefaults.productionSkillLevel;
  const includeSelfWork = overrides?.includeSelfWork ?? false;
  const offerWagePerPp = overrides?.offerWagePerPp ?? row.offerWagePerPp;
  const fromBook = book ? effectiveProfitForItem(row.company.itemCode, book) : null;
  const profitPerPp = fromBook?.profitPerPp ?? resolveProfitPerPp(row);
  const inputCostPerUnit = fromBook?.inputCost ?? resolveInputCostPerUnit(row);
  const incomeTaxRate = row.incomeTaxRate;

  const day = companyDay({
    aeLevel,
    productionBonus,
    profitPerPp: profitPerPp ?? 0,
    itemCode: row.company.itemCode,
    inputCostPerUnit,
    entrepreneurshipLevel,
    productionSkillLevel,
    includeSelfWork,
    workers: included.map((w) => ({
      id: w.id,
      energyLevel: w.energyLevel,
      productionLevel: w.productionLevel,
      fidelityPct: w.fidelityPct,
      grossWagePerPp: w.wagePerPp,
    })),
  });

  return {
    companyId,
    dirty: isDirty(overrides, assigned),
    workersStatus: row.workersStatus,
    incomeTaxRate,
    incomeTaxAssumed: row.incomeTaxAssumed,
    activeWorkerCount: included.length,
    profitPerPp: profitPerPp ?? 0,
    day,
    offerWage: offerWagePerPp != null ? wagePair(offerWagePerPp, incomeTaxRate) : null,
    maxWage: wagePair(day.maxGrossWagePerPp, incomeTaxRate),
  };
}

export function derivePortfolioNet(cards: DerivedCompanyCard[]): number {
  let total = 0;
  for (const card of cards) {
    total += card.day.netPerDay;
  }
  return total;
}
