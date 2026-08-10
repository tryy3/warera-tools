import type { CompanyAllocation } from "./types";

export type EnrichedProducerRow = {
  kind: "ae" | "worker" | "selfWork";
  id: string;
  rowUnits: number;
  wageCost: number;
  dailyCost: number;
  profitNow: number;
  recommendedSell: number | null;
};

export const RECOMMENDED_SELL_EPS = 0.001;

export function recommendedSell(dailyCost: number, rowUnits: number): number | null {
  if (!(rowUnits > 0) || !Number.isFinite(dailyCost)) return null;
  return dailyCost / rowUnits + RECOMMENDED_SELL_EPS;
}

export function enrichProducerRows(input: {
  unitsOut: number;
  sellPrice: number;
  allocation: CompanyAllocation;
  ae: { id: string; rowUnits: number; wageCost: number };
  workers: Array<{ id: string; rowUnits: number; wageCost: number }>;
  selfWork?: { id: string; rowUnits: number; wageCost: number };
}): EnrichedProducerRow[] {
  const { unitsOut, allocation } = input;
  const eff = allocation.effectiveInputCostPerUnit;
  const soldFraction = unitsOut > 0 ? allocation.soldOut / unitsOut : 0;

  const one = (
    kind: EnrichedProducerRow["kind"],
    id: string,
    rowUnits: number,
    wageCost: number,
  ): EnrichedProducerRow => {
    if (unitsOut === 0) {
      return {
        kind,
        id,
        rowUnits,
        wageCost,
        dailyCost: wageCost,
        profitNow: -wageCost,
        recommendedSell: null,
      };
    }

    const dailyCost = wageCost + rowUnits * eff;
    const rowRevenue = rowUnits * soldFraction * input.sellPrice;
    return {
      kind,
      id,
      rowUnits,
      wageCost,
      dailyCost,
      profitNow: rowRevenue - dailyCost,
      recommendedSell: recommendedSell(dailyCost, rowUnits),
    };
  };

  const out: EnrichedProducerRow[] = [one("ae", input.ae.id, input.ae.rowUnits, input.ae.wageCost)];
  for (const w of input.workers) out.push(one("worker", w.id, w.rowUnits, w.wageCost));
  if (input.selfWork)
    out.push(one("selfWork", input.selfWork.id, input.selfWork.rowUnits, input.selfWork.wageCost));
  return out;
}
