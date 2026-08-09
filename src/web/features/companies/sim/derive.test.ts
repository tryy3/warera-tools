import { describe, expect, it } from "vite-plus/test";
import { companyDay } from "../../../../economy/workers/company-day";
import { wagePair } from "../../../../economy/workers/wages";
import type { CompanyAdvisorRow, ProfitPpBreakdown } from "../types";
import { deriveCompanyCard, derivePortfolioNet } from "./derive";
import type { CompanySimState, SimWorker } from "./types";

const OWNER = { entrepreneurshipLevel: 4, productionSkillLevel: 6 };

function profitBreakdown(
  partial: Partial<ProfitPpBreakdown> & Pick<ProfitPpBreakdown, "itemCode">,
): ProfitPpBreakdown {
  return {
    marketPrice: partial.marketPrice ?? 2,
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
  it("sums netPerDay across derived cards", () => {
    const rowA = row({ company: { id: "a" } });
    const rowB = row({ company: { id: "b" } });
    const state = emptyState([simWorker({ id: "w1", assignment: "a", wagePerPp: 0.04 })]);

    const cards = [deriveCompanyCard(rowA, state, OWNER), deriveCompanyCard(rowB, state, OWNER)];

    expect(derivePortfolioNet(cards)).toBeCloseTo(
      cards[0]!.day.netPerDay + cards[1]!.day.netPerDay,
      6,
    );
  });
});
