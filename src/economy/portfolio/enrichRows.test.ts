import { describe, expect, it } from "vitest";
import { enrichProducerRows, recommendedSell, RECOMMENDED_SELL_EPS } from "./enrichRows";
import type { CompanyAllocation } from "./types";

const allocation: CompanyAllocation = {
  transferredOut: 0,
  soldOut: 80,
  marketBoughtByInput: {},
  marketBuyCash: 40,
  sellRevenueActual: 80,
  effectiveInputCostPerUnit: 0.5, // 40/80
  wageCostPerDay: 10,
  actualProfit: 30,
  markToMarketProfit: 30,
};

describe("recommendedSell", () => {
  it("returns null when units are 0", () => {
    expect(recommendedSell(10, 0)).toBeNull();
  });
  it("adds eps above break-even", () => {
    expect(recommendedSell(10, 100)).toBeCloseTo(10 / 100 + RECOMMENDED_SELL_EPS);
  });
});

describe("enrichProducerRows", () => {
  it("splits sold revenue and input cost pro-rata by units", () => {
    const rows = enrichProducerRows({
      unitsOut: 80,
      sellPrice: 1,
      allocation,
      ae: { id: "ae", rowUnits: 48, wageCost: 0 },
      workers: [{ id: "w1", rowUnits: 32, wageCost: 10 }],
    });
    const ae = rows.find((r) => r.kind === "ae")!;
    const w = rows.find((r) => r.kind === "worker")!;
    expect(ae.dailyCost).toBeCloseTo(48 * 0.5);
    expect(ae.profitNow).toBeCloseTo((48 / 80) * 80 * 1 - 48 * 0.5);
    expect(w.dailyCost).toBeCloseTo(10 + 32 * 0.5);
    expect(w.profitNow).toBeCloseTo((32 / 80) * 80 * 1 - (10 + 32 * 0.5));
    expect(w.recommendedSell).toBeCloseTo(w.dailyCost / 32 + RECOMMENDED_SELL_EPS);
  });

  it("shows negative profit when everything is transferred away", () => {
    const transferred: CompanyAllocation = {
      ...allocation,
      soldOut: 0,
      sellRevenueActual: 0,
      actualProfit: -50,
    };
    const rows = enrichProducerRows({
      unitsOut: 80,
      sellPrice: 1,
      allocation: transferred,
      ae: { id: "ae", rowUnits: 80, wageCost: 0 },
      workers: [],
    });
    expect(rows[0]!.profitNow).toBeCloseTo(-80 * 0.5);
  });
});
