import { describe, expect, it } from "vite-plus/test";
import { companyDay } from "../../../../economy/workers/company-day";
import { wagePair } from "../../../../economy/workers/wages";
import type { CompanyAdvisorRow, ProfitPpBreakdown } from "../types";
import {
  applyPortfolioAllocation,
  deriveCompanyCard,
  derivePortfolioCards,
  derivePortfolioNet,
} from "./derive";
import type { CompanySimState, SimWorker } from "./types";

const OWNER = { entrepreneurshipLevel: 4, productionSkillLevel: 6 };

function profitBreakdown(
  partial: Partial<ProfitPpBreakdown> & Pick<ProfitPpBreakdown, "itemCode">,
): ProfitPpBreakdown {
  return {
    marketPrice: partial.marketPrice ?? 2,
    buyPrice: partial.buyPrice ?? 1.9,
    sellPrice: partial.sellPrice ?? partial.marketPrice ?? 2,
    inputCost: partial.inputCost ?? 0.8,
    unitProfit: partial.unitProfit ?? 1.2,
    consumedPp: partial.consumedPp ?? 10,
    profitPerPp: partial.profitPerPp ?? 0.12,
    missingInputs: partial.missingInputs ?? [],
    formula: partial.formula ?? "test",
    itemCode: partial.itemCode,
  };
}

function row(
  partial: Omit<Partial<CompanyAdvisorRow>, "company"> & {
    company: Partial<CompanyAdvisorRow["company"]> & Pick<CompanyAdvisorRow["company"], "id">;
  },
): CompanyAdvisorRow {
  const { company: c, ...rest } = partial;
  return {
    company: {
      id: c.id,
      name: c.name ?? c.id,
      itemCode: c.itemCode ?? "bread",
      regionId: c.regionId ?? null,
      regionName: c.regionName ?? null,
      regionCountryCode: c.regionCountryCode ?? null,
      aeLevel: c.aeLevel ?? 3,
      productionBonus: c.productionBonus ?? 0.5,
    },
    bonusDetails: rest.bonusDetails ?? null,
    profitBreakdown: rest.profitBreakdown ?? profitBreakdown({ itemCode: c.itemCode ?? "bread" }),
    aeBreakdown: rest.aeBreakdown ?? null,
    currentProfitPerPp: rest.currentProfitPerPp ?? 0.12,
    currentDailyValue: rest.currentDailyValue ?? null,
    bestSwitch: rest.bestSwitch ?? null,
    workers: rest.workers ?? [],
    workersStatus: rest.workersStatus ?? "ok",
    incomeTaxRate: rest.incomeTaxRate ?? 0.25,
    incomeTaxAssumed: rest.incomeTaxAssumed ?? false,
    offerWagePerPp: rest.offerWagePerPp === undefined ? 0.1 : rest.offerWagePerPp,
  };
}

function simWorker(partial: Partial<SimWorker> & Pick<SimWorker, "id" | "assignment">): SimWorker {
  return {
    id: partial.id,
    kind: partial.kind ?? "real",
    name: partial.name ?? partial.id,
    assignment: partial.assignment,
    wagePerPp: partial.wagePerPp ?? 0.05,
    energyLevel: partial.energyLevel ?? 5,
    productionLevel: partial.productionLevel ?? 5,
    fidelityPct: partial.fidelityPct ?? 0,
    assumedFields: partial.assumedFields ?? [],
    dirty: partial.dirty ?? false,
    enrichmentError: partial.enrichmentError ?? false,
  };
}

function emptyState(workers: SimWorker[] = []): CompanySimState {
  return { workers, overrides: {}, liveEpoch: 1 };
}

describe("deriveCompanyCard", () => {
  it("uses session book prices for Profit/PP across companies of the same item", () => {
    const a = row({
      company: { id: "a", itemCode: "steel" },
      currentProfitPerPp: 0.05,
      profitBreakdown: profitBreakdown({
        itemCode: "steel",
        sellPrice: 1,
        buyPrice: 0.8,
        inputCost: 0.5,
        profitPerPp: 0.05,
        consumedPp: 10,
      }),
    });
    const b = row({
      company: { id: "b", itemCode: "steel" },
      currentProfitPerPp: 0.05,
      profitBreakdown: profitBreakdown({
        itemCode: "steel",
        sellPrice: 1,
        buyPrice: 0.8,
        inputCost: 0.5,
        profitPerPp: 0.05,
        consumedPp: 10,
      }),
    });
    const book = {
      buy: { iron: 0.09, steel: 0.8 },
      sell: { iron: 0.06, steel: 1 },
    };

    const cardA = deriveCompanyCard(a, emptyState(), OWNER, book);
    const cardB = deriveCompanyCard(b, emptyState(), OWNER, book);

    expect(cardA.profitPerPp).toBeCloseTo(0.01, 8);
    expect(cardB.profitPerPp).toBeCloseTo(0.01, 8);
  });

  it("excludes enrichmentError workers from totals until dirty", () => {
    const company = row({ company: { id: "a" } });
    const errorWorker = simWorker({
      id: "err",
      assignment: "a",
      wagePerPp: 0.2,
      enrichmentError: true,
      dirty: false,
    });
    const okWorker = simWorker({
      id: "ok",
      assignment: "a",
      wagePerPp: 0.05,
      enrichmentError: false,
    });

    const withErrorOnly = deriveCompanyCard(company, emptyState([errorWorker]), OWNER);
    const withBoth = deriveCompanyCard(company, emptyState([errorWorker, okWorker]), OWNER);
    const afterEdit = deriveCompanyCard(
      company,
      emptyState([{ ...errorWorker, dirty: true }, okWorker]),
      OWNER,
    );

    expect(withErrorOnly.activeWorkerCount).toBe(0);
    expect(withErrorOnly.day.workers).toHaveLength(0);
    expect(withBoth.activeWorkerCount).toBe(1);
    expect(withBoth.day.workers.map((w) => w.id)).toEqual(["ok"]);
    expect(afterEdit.activeWorkerCount).toBe(2);
    expect(afterEdit.day.workers.map((w) => w.id).toSorted()).toEqual(["err", "ok"]);
  });

  it("moving a worker moves their wage cost between company cards", () => {
    const rowA = row({ company: { id: "a" } });
    const rowB = row({ company: { id: "b" } });
    const worker = simWorker({
      id: "w1",
      assignment: "a",
      wagePerPp: 0.08,
      energyLevel: 5,
      productionLevel: 5,
      fidelityPct: 2,
    });

    const onA = emptyState([worker]);
    const cardA1 = deriveCompanyCard(rowA, onA, OWNER);
    const cardB1 = deriveCompanyCard(rowB, onA, OWNER);

    expect(cardA1.activeWorkerCount).toBe(1);
    expect(cardB1.activeWorkerCount).toBe(0);
    expect(cardA1.day.workerWageCostPerDay).toBeGreaterThan(0);
    expect(cardB1.day.workerWageCostPerDay).toBe(0);

    const onB = emptyState([{ ...worker, assignment: "b" }]);
    const cardA2 = deriveCompanyCard(rowA, onB, OWNER);
    const cardB2 = deriveCompanyCard(rowB, onB, OWNER);

    expect(cardA2.activeWorkerCount).toBe(0);
    expect(cardB2.activeWorkerCount).toBe(1);
    expect(cardA2.day.workerWageCostPerDay).toBe(0);
    expect(cardB2.day.workerWageCostPerDay).toBeCloseTo(cardA1.day.workerWageCostPerDay, 6);
    expect(cardB2.day.netPerDay).not.toBeCloseTo(cardB1.day.netPerDay, 6);
  });

  it("net at 10% fidelity differs from current when workers are below max fidelity", () => {
    const advisor = row({ company: { id: "c1" } });
    const state = emptyState([
      simWorker({
        id: "w1",
        assignment: "c1",
        wagePerPp: 0.05,
        fidelityPct: 0,
      }),
    ]);

    const card = deriveCompanyCard(advisor, state, OWNER);

    expect(card.day.netPerDayAtMaxWorkerFidelity).not.toBeCloseTo(card.day.netPerDay, 6);
  });

  it("applies company overrides and ownerDefaults for AE, bonus, and self-work levels", () => {
    const advisor = row({
      company: { id: "c1", aeLevel: 2, productionBonus: 0.2 },
    });
    const state: CompanySimState = {
      workers: [],
      overrides: {
        c1: {
          aeLevel: 5,
          productionBonus: 0.6,
          entrepreneurshipLevel: 8,
          productionSkillLevel: 9,
          includeSelfWork: true,
        },
      },
      liveEpoch: 1,
    };

    const card = deriveCompanyCard(advisor, state, OWNER);
    const expected = companyDay({
      aeLevel: 5,
      productionBonus: 0.6,
      profitPerPp: 0.12,
      itemCode: "bread",
      inputCostPerUnit: 0.8,
      entrepreneurshipLevel: 8,
      productionSkillLevel: 9,
      includeSelfWork: true,
      workers: [],
    });

    expect(card.day.netPerDay).toBeCloseTo(expected.netPerDay, 6);
    expect(card.day.selfWorkDailyPp).toBeCloseTo(expected.selfWorkDailyPp, 6);
  });

  it("passes profitBreakdown.inputCost as inputCostPerUnit (not divided by consumedPp)", () => {
    const advisor = row({
      company: { id: "c1", aeLevel: 0, productionBonus: 0 },
      profitBreakdown: profitBreakdown({
        itemCode: "bread",
        inputCost: 1.5,
        consumedPp: 10,
        profitPerPp: 0.1,
      }),
      currentProfitPerPp: 0.1,
    });
    const state = emptyState([
      simWorker({
        id: "w1",
        assignment: "c1",
        wagePerPp: 0.01,
        fidelityPct: 0,
      }),
    ]);

    const card = deriveCompanyCard(advisor, state, OWNER);
    const expected = companyDay({
      aeLevel: 0,
      productionBonus: 0,
      profitPerPp: 0.1,
      itemCode: "bread",
      inputCostPerUnit: 1.5,
      entrepreneurshipLevel: OWNER.entrepreneurshipLevel,
      productionSkillLevel: OWNER.productionSkillLevel,
      includeSelfWork: false,
      workers: [
        {
          id: "w1",
          energyLevel: 5,
          productionLevel: 5,
          fidelityPct: 0,
          grossWagePerPp: 0.01,
        },
      ],
    });

    expect(card.day.inputCostPerDay).toBeCloseTo(expected.inputCostPerDay, 6);
  });

  it("marks dirty for overrides, dirty assigned workers, or simulated assignees", () => {
    const advisor = row({ company: { id: "c1" } });

    expect(deriveCompanyCard(advisor, emptyState(), OWNER).dirty).toBe(false);

    expect(
      deriveCompanyCard(
        advisor,
        { workers: [], overrides: { c1: { aeLevel: 4 } }, liveEpoch: 1 },
        OWNER,
      ).dirty,
    ).toBe(true);

    expect(
      deriveCompanyCard(
        advisor,
        emptyState([simWorker({ id: "w1", assignment: "c1", dirty: true })]),
        OWNER,
      ).dirty,
    ).toBe(true);

    expect(
      deriveCompanyCard(
        advisor,
        emptyState([
          simWorker({
            id: "sim-1",
            kind: "simulated",
            assignment: "c1",
            dirty: false,
          }),
        ]),
        OWNER,
      ).dirty,
    ).toBe(true);

    expect(
      deriveCompanyCard(
        advisor,
        emptyState([
          simWorker({ id: "w2", assignment: "other", dirty: true }),
          simWorker({
            id: "sim-2",
            kind: "simulated",
            assignment: null,
            dirty: false,
          }),
        ]),
        OWNER,
      ).dirty,
    ).toBe(false);
  });

  it("exposes offerWage and maxWage as taxed wage pairs", () => {
    const advisor = row({
      company: { id: "c1" },
      incomeTaxRate: 0.2,
      offerWagePerPp: 0.09,
      currentProfitPerPp: 0.15,
    });
    const state: CompanySimState = {
      workers: [],
      overrides: { c1: { offerWagePerPp: 0.11 } },
      liveEpoch: 1,
    };

    const card = deriveCompanyCard(advisor, state, OWNER);

    expect(card.offerWage).toEqual(wagePair(0.11, 0.2));
    expect(card.maxWage).toEqual(wagePair(card.day.maxGrossWagePerPp, 0.2));
    // Break-even @0% fid includes production bonus (default 0.5 on fixture).
    expect(card.maxWage.gross).toBeCloseTo(0.15 * 1.5, 6);
    expect(card.workersStatus).toBe("ok");
    expect(card.incomeTaxRate).toBe(0.2);
    expect(card.incomeTaxAssumed).toBe(false);
    expect(card.companyId).toBe("c1");
  });

  it("returns null offerWage when neither override nor live offer exists", () => {
    const advisor = row({ company: { id: "c1" }, offerWagePerPp: null });
    const card = deriveCompanyCard(advisor, emptyState(), OWNER);
    expect(card.offerWage).toBeNull();
  });
});

describe("derivePortfolioNet", () => {
  it("sums actualProfit across derived cards", () => {
    const rowA = row({ company: { id: "a" } });
    const rowB = row({ company: { id: "b" } });
    const state = emptyState([simWorker({ id: "w1", assignment: "a", wagePerPp: 0.04 })]);
    const book = {
      buy: { grain: 0.1, bread: 0.8 },
      sell: { grain: 0.12, bread: 1 },
    };

    const { cards, portfolioActual } = derivePortfolioCards([rowA, rowB], state, OWNER, book);

    expect(derivePortfolioNet(cards)).toBeCloseTo(
      cards[0]!.actualProfit + cards[1]!.actualProfit,
      6,
    );
    expect(derivePortfolioNet(cards)).toBeCloseTo(portfolioActual, 6);
  });
});

describe("derivePortfolioCards / applyPortfolioAllocation", () => {
  it("waterfalls iron into steel in companies array order", () => {
    // aeLevel=5, bonus=0 → 120 PP/day; iron consumedPp=1 → 120 units
    const ironRow = row({
      company: { id: "iron-1", itemCode: "iron", aeLevel: 5, productionBonus: 0 },
      profitBreakdown: profitBreakdown({
        itemCode: "iron",
        inputCost: 0,
        consumedPp: 1,
        profitPerPp: 0.05,
        sellPrice: 0.06,
        buyPrice: 0.05,
      }),
      currentProfitPerPp: 0.05,
    });
    // aeLevel=1, bonus=0 → 24 PP/day; steel consumedPp=10 → 2.4 units → 24 iron demand
    const steelRow = row({
      company: { id: "steel-1", itemCode: "steel", aeLevel: 1, productionBonus: 0 },
      profitBreakdown: profitBreakdown({
        itemCode: "steel",
        inputCost: 0.5,
        consumedPp: 10,
        profitPerPp: 0.05,
        sellPrice: 1,
        buyPrice: 0.8,
      }),
      currentProfitPerPp: 0.05,
    });
    const book = {
      buy: { iron: 0.05, steel: 0.8 },
      sell: { iron: 0.06, steel: 1 },
    };

    const { cards, portfolioActual, portfolioMarkToMarket } = derivePortfolioCards(
      [ironRow, steelRow],
      emptyState(),
      OWNER,
      book,
    );

    const iron = cards[0]!;
    const steel = cards[1]!;

    expect(iron.day.unitsProduced).toBeCloseTo(120, 6);
    expect(steel.day.unitsProduced).toBeCloseTo(2.4, 6);

    expect(iron.allocation!.transferredOut).toBeCloseTo(24, 6);
    expect(iron.allocation!.soldOut).toBeCloseTo(96, 6);
    expect(steel.allocation!.marketBoughtByInput.iron ?? 0).toBeCloseTo(0, 6);
    expect(steel.allocation!.marketBuyCash).toBeCloseTo(0, 6);

    expect(iron.actualProfit).toBeCloseTo(96 * 0.06, 6);
    expect(steel.actualProfit).toBeCloseTo(2.4 * 1, 6);
    expect(portfolioActual).toBeCloseTo(iron.actualProfit + steel.actualProfit, 6);
    expect(portfolioMarkToMarket).toBeCloseTo(
      iron.markToMarketProfit + steel.markToMarketProfit,
      6,
    );

    expect(iron.producerRows.some((r) => r.kind === "ae")).toBe(true);
    expect(iron.producerRows.some((r) => r.kind === "selfWork")).toBe(false);
  });

  it("markets steel iron shortfall when supply is insufficient", () => {
    // iron: 24 units/day
    const ironRow = row({
      company: { id: "iron-1", itemCode: "iron", aeLevel: 1, productionBonus: 0 },
      profitBreakdown: profitBreakdown({
        itemCode: "iron",
        inputCost: 0,
        consumedPp: 1,
        profitPerPp: 0.05,
      }),
      currentProfitPerPp: 0.05,
    });
    // steel: 4.8 units → 48 iron demand
    const steelRow = row({
      company: { id: "steel-1", itemCode: "steel", aeLevel: 2, productionBonus: 0 },
      profitBreakdown: profitBreakdown({
        itemCode: "steel",
        inputCost: 0.5,
        consumedPp: 10,
        profitPerPp: 0.05,
      }),
      currentProfitPerPp: 0.05,
    });
    const book = {
      buy: { iron: 0.05, steel: 0.8 },
      sell: { iron: 0.06, steel: 1 },
    };

    const base = [
      deriveCompanyCard(ironRow, emptyState(), OWNER, book),
      deriveCompanyCard(steelRow, emptyState(), OWNER, book),
    ];
    const { cards } = applyPortfolioAllocation(base, [ironRow, steelRow], book);

    expect(cards[0]!.allocation!.soldOut).toBeCloseTo(0, 6);
    expect(cards[0]!.allocation!.transferredOut).toBeCloseTo(24, 6);
    expect(cards[1]!.allocation!.marketBoughtByInput.iron).toBeCloseTo(24, 6);
    expect(cards[1]!.allocation!.marketBuyCash).toBeCloseTo(24 * 0.05, 6);
  });
});
