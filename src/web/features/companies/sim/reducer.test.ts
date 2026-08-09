import { describe, expect, it } from "vite-plus/test";
import type { AdvisorWorker } from "../types";
import { createMemoryPersistence } from "./persistence";
import { companySimReducer, initialCompanySimState } from "./reducer";
import type { CompanySimState, HydratePayload, SimWorker } from "./types";

function advisorWorker(
  partial: Partial<AdvisorWorker> & Pick<AdvisorWorker, "userId">,
): AdvisorWorker {
  return {
    username: null,
    wagePerPp: null,
    energyLevel: null,
    productionLevel: null,
    fidelityPct: null,
    enrichmentError: false,
    ...partial,
  };
}

function livePayload(companies: HydratePayload["companies"]): HydratePayload {
  return { companies };
}

describe("companySimReducer", () => {
  it("clears assumedFields and sets enrichmentError when lite enrich failed", () => {
    const live = livePayload([
      {
        companyId: "c1",
        offerWagePerPp: 0.42,
        workers: [
          advisorWorker({
            userId: "u1",
            wagePerPp: 0.1,
            energyLevel: null,
            productionLevel: null,
            fidelityPct: 2,
            enrichmentError: true,
          }),
        ],
      },
    ]);
    const next = companySimReducer(initialCompanySimState, {
      type: "hydrate",
      live,
      keepOverrides: false,
    });
    const w = next.workers[0]!;
    expect(w.enrichmentError).toBe(true);
    expect(w.assumedFields).toEqual([]);
    expect(w.energyLevel).toBe(5);
  });

  it("hydrates real workers with defaults and assumedFields for nulls", () => {
    const live = livePayload([
      {
        companyId: "c1",
        offerWagePerPp: 0.42,
        workers: [
          advisorWorker({
            userId: "u1",
            username: "Alice",
            wagePerPp: null,
            energyLevel: null,
            productionLevel: null,
            fidelityPct: null,
          }),
          advisorWorker({
            userId: "u2",
            username: null,
            wagePerPp: 0.5,
            energyLevel: 7,
            productionLevel: 8,
            fidelityPct: 3,
          }),
        ],
      },
    ]);

    const next = companySimReducer(initialCompanySimState, {
      type: "hydrate",
      live,
      keepOverrides: false,
    });

    expect(next.liveEpoch).toBe(1);
    expect(next.workers).toHaveLength(2);

    const alice = next.workers.find((w) => w.id === "u1");
    expect(alice).toMatchObject({
      kind: "real",
      name: "Alice",
      assignment: "c1",
      wagePerPp: 0.42,
      energyLevel: 5,
      productionLevel: 5,
      fidelityPct: 0,
      dirty: false,
    });
    expect(alice?.assumedFields).toEqual(
      expect.arrayContaining(["wagePerPp", "energyLevel", "productionLevel", "fidelityPct"]),
    );

    const u2 = next.workers.find((w) => w.id === "u2");
    expect(u2).toMatchObject({
      name: "u2",
      wagePerPp: 0.5,
      energyLevel: 7,
      productionLevel: 8,
      fidelityPct: 3,
      assumedFields: [],
    });
  });

  it("uses wage 0 and keeps overrides when keepOverrides is true", () => {
    const seeded: CompanySimState = {
      workers: [],
      overrides: { c1: { aeLevel: 12 } },
      liveEpoch: 3,
    };
    const live = livePayload([
      {
        companyId: "c1",
        offerWagePerPp: null,
        workers: [advisorWorker({ userId: "u1", wagePerPp: null })],
      },
    ]);

    const kept = companySimReducer(seeded, { type: "hydrate", live, keepOverrides: true });
    expect(kept.overrides).toEqual({ c1: { aeLevel: 12 } });
    expect(kept.liveEpoch).toBe(4);
    expect(kept.workers[0]?.wagePerPp).toBe(0);
    expect(kept.workers[0]?.assumedFields).toContain("wagePerPp");

    const cleared = companySimReducer(seeded, { type: "hydrate", live, keepOverrides: false });
    expect(cleared.overrides).toEqual({});
  });

  it("hydrates, adds sim, moves, deactivates, then resets company from live", () => {
    const live = livePayload([
      {
        companyId: "c1",
        offerWagePerPp: 0.3,
        workers: [
          advisorWorker({
            userId: "u1",
            username: "Alice",
            wagePerPp: 0.3,
            energyLevel: 6,
            productionLevel: 6,
            fidelityPct: 2,
          }),
        ],
      },
      {
        companyId: "c2",
        offerWagePerPp: 0.4,
        workers: [
          advisorWorker({
            userId: "u2",
            username: "Bob",
            wagePerPp: 0.4,
            energyLevel: 5,
            productionLevel: 5,
            fidelityPct: 1,
          }),
        ],
      },
    ]);

    let state = companySimReducer(initialCompanySimState, {
      type: "hydrate",
      live,
      keepOverrides: false,
    });
    expect(state.workers.map((w) => w.id).sort()).toEqual(["u1", "u2"]);

    state = companySimReducer(state, {
      type: "setCompanyOverride",
      companyId: "c1",
      patch: { aeLevel: 9, offerWagePerPp: 0.99 },
    });
    expect(state.overrides.c1).toEqual({ aeLevel: 9, offerWagePerPp: 0.99 });

    const sim: SimWorker = {
      id: "sim-1",
      kind: "simulated",
      name: "Sim Worker 1",
      assignment: "c1",
      wagePerPp: 0.25,
      energyLevel: 5,
      productionLevel: 5,
      fidelityPct: 0,
      assumedFields: [],
      dirty: false,
      enrichmentError: false,
    };
    state = companySimReducer(state, { type: "addSimWorker", worker: sim });
    expect(state.workers.some((w) => w.id === "sim-1")).toBe(true);

    state = companySimReducer(state, {
      type: "setAssignment",
      id: "u1",
      assignment: "c2",
    });
    expect(state.workers.find((w) => w.id === "u1")?.assignment).toBe("c2");
    expect(state.workers.find((w) => w.id === "u1")?.dirty).toBe(true);

    state = companySimReducer(state, {
      type: "setAssignment",
      id: "u2",
      assignment: null,
    });
    expect(state.workers.find((w) => w.id === "u2")?.assignment).toBeNull();

    state = companySimReducer(state, {
      type: "updateWorker",
      id: "sim-1",
      patch: { wagePerPp: 0.55 },
    });
    expect(state.workers.find((w) => w.id === "sim-1")).toMatchObject({
      wagePerPp: 0.55,
      dirty: true,
    });

    // Fresh live snapshot for c1 (Alice still at c1 with updated levels)
    const resetLive = livePayload([
      {
        companyId: "c1",
        offerWagePerPp: 0.3,
        workers: [
          advisorWorker({
            userId: "u1",
            username: "Alice",
            wagePerPp: 0.3,
            energyLevel: 9,
            productionLevel: 9,
            fidelityPct: 4,
          }),
        ],
      },
      {
        companyId: "c2",
        offerWagePerPp: 0.4,
        workers: [
          advisorWorker({
            userId: "u2",
            username: "Bob",
            wagePerPp: 0.4,
            energyLevel: 5,
            productionLevel: 5,
            fidelityPct: 1,
          }),
        ],
      },
    ]);

    state = companySimReducer(state, {
      type: "resetCompany",
      companyId: "c1",
      live: resetLive,
    });

    expect(state.overrides.c1).toBeUndefined();
    const alice = state.workers.find((w) => w.id === "u1");
    expect(alice).toMatchObject({
      assignment: "c1",
      energyLevel: 9,
      productionLevel: 9,
      fidelityPct: 4,
      dirty: false,
    });
    // Sim worker on c1 kept; Bob still deactivated
    expect(state.workers.find((w) => w.id === "sim-1")?.assignment).toBe("c1");
    expect(state.workers.find((w) => w.id === "u2")?.assignment).toBeNull();
  });

  it("removes simulated workers only via removeSimWorker", () => {
    const sim: SimWorker = {
      id: "sim-x",
      kind: "simulated",
      name: "X",
      assignment: null,
      wagePerPp: 0,
      energyLevel: 5,
      productionLevel: 5,
      fidelityPct: 0,
      assumedFields: [],
      dirty: false,
      enrichmentError: false,
    };
    let state = companySimReducer(initialCompanySimState, {
      type: "hydrate",
      live: livePayload([
        {
          companyId: "c1",
          offerWagePerPp: null,
          workers: [
            advisorWorker({
              userId: "u1",
              wagePerPp: 1,
              energyLevel: 5,
              productionLevel: 5,
              fidelityPct: 0,
            }),
          ],
        },
      ]),
      keepOverrides: false,
    });
    state = companySimReducer(state, { type: "addSimWorker", worker: sim });
    state = companySimReducer(state, { type: "removeSimWorker", id: "sim-x" });
    expect(state.workers.map((w) => w.id)).toEqual(["u1"]);

    state = companySimReducer(state, { type: "removeSimWorker", id: "u1" });
    expect(state.workers.map((w) => w.id)).toEqual(["u1"]);
  });

  it("keeps simulated workers across hydrate", () => {
    const sim: SimWorker = {
      id: "sim-1",
      kind: "simulated",
      name: "Sim",
      assignment: "c1",
      wagePerPp: 0.1,
      energyLevel: 5,
      productionLevel: 5,
      fidelityPct: 0,
      assumedFields: [],
      dirty: false,
      enrichmentError: false,
    };
    let state: CompanySimState = {
      ...initialCompanySimState,
      workers: [sim],
    };
    state = companySimReducer(state, {
      type: "hydrate",
      live: livePayload([
        {
          companyId: "c1",
          offerWagePerPp: null,
          workers: [
            advisorWorker({
              userId: "u1",
              wagePerPp: 1,
              energyLevel: 5,
              productionLevel: 5,
              fidelityPct: 0,
            }),
          ],
        },
      ]),
      keepOverrides: true,
    });
    expect(state.workers.map((w) => w.id).sort()).toEqual(["sim-1", "u1"]);
  });

  it("keepOverrides hydrate merges dirty/moved reals and refreshes clean ones", () => {
    const sim: SimWorker = {
      id: "sim-1",
      kind: "simulated",
      name: "Sim",
      assignment: null,
      wagePerPp: 0.2,
      energyLevel: 5,
      productionLevel: 5,
      fidelityPct: 0,
      assumedFields: [],
      dirty: true,
      enrichmentError: false,
    };

    let state = companySimReducer(initialCompanySimState, {
      type: "hydrate",
      live: livePayload([
        {
          companyId: "c1",
          offerWagePerPp: 0.3,
          workers: [
            advisorWorker({
              userId: "dirty-edit",
              username: "Alice",
              wagePerPp: 0.3,
              energyLevel: 5,
              productionLevel: 5,
              fidelityPct: 0,
            }),
            advisorWorker({
              userId: "moved",
              username: "Bob",
              wagePerPp: 0.3,
              energyLevel: 5,
              productionLevel: 5,
              fidelityPct: 0,
            }),
            advisorWorker({
              userId: "clean",
              username: "Carol",
              wagePerPp: 0.3,
              energyLevel: 5,
              productionLevel: 5,
              fidelityPct: 0,
            }),
            advisorWorker({
              userId: "vanished",
              username: "Dave",
              wagePerPp: 0.3,
              energyLevel: 5,
              productionLevel: 5,
              fidelityPct: 0,
            }),
          ],
        },
        {
          companyId: "c2",
          offerWagePerPp: 0.4,
          workers: [],
        },
      ]),
      keepOverrides: false,
    });

    state = companySimReducer(state, {
      type: "updateWorker",
      id: "dirty-edit",
      patch: { wagePerPp: 0.99, energyLevel: 9 },
    });
    state = companySimReducer(state, {
      type: "setAssignment",
      id: "moved",
      assignment: "c2",
    });
    state = companySimReducer(state, { type: "addSimWorker", worker: sim });
    state = companySimReducer(state, {
      type: "setCompanyOverride",
      companyId: "c1",
      patch: { aeLevel: 11 },
    });

    const refreshedLive = livePayload([
      {
        companyId: "c1",
        offerWagePerPp: 0.35,
        workers: [
          advisorWorker({
            userId: "dirty-edit",
            username: "Alice",
            wagePerPp: 0.35,
            energyLevel: 6,
            productionLevel: 6,
            fidelityPct: 2,
          }),
          advisorWorker({
            userId: "moved",
            username: "Bob",
            wagePerPp: 0.35,
            energyLevel: 6,
            productionLevel: 6,
            fidelityPct: 2,
          }),
          advisorWorker({
            userId: "clean",
            username: "Carol",
            wagePerPp: 0.35,
            energyLevel: 7,
            productionLevel: 7,
            fidelityPct: 3,
          }),
          // vanished dropped from live
          advisorWorker({
            userId: "new-real",
            username: "Eve",
            wagePerPp: 0.5,
            energyLevel: 4,
            productionLevel: 4,
            fidelityPct: 1,
          }),
        ],
      },
      {
        companyId: "c2",
        offerWagePerPp: 0.4,
        workers: [],
      },
    ]);

    state = companySimReducer(state, {
      type: "hydrate",
      live: refreshedLive,
      keepOverrides: true,
    });

    expect(state.overrides).toEqual({ c1: { aeLevel: 11 } });
    expect(state.workers.map((w) => w.id).sort()).toEqual([
      "clean",
      "dirty-edit",
      "moved",
      "new-real",
      "sim-1",
    ]);

    expect(state.workers.find((w) => w.id === "dirty-edit")).toMatchObject({
      wagePerPp: 0.99,
      energyLevel: 9,
      assignment: "c1",
      dirty: true,
    });
    expect(state.workers.find((w) => w.id === "moved")).toMatchObject({
      assignment: "c2",
      wagePerPp: 0.3,
      dirty: true,
    });
    expect(state.workers.find((w) => w.id === "clean")).toMatchObject({
      wagePerPp: 0.35,
      energyLevel: 7,
      productionLevel: 7,
      fidelityPct: 3,
      assignment: "c1",
      dirty: false,
    });
    expect(state.workers.find((w) => w.id === "new-real")).toMatchObject({
      name: "Eve",
      assignment: "c1",
      dirty: false,
    });
    expect(state.workers.find((w) => w.id === "vanished")).toBeUndefined();
    expect(state.workers.find((w) => w.id === "sim-1")).toMatchObject({
      assignment: null,
      kind: "simulated",
    });
  });
});

describe("createMemoryPersistence", () => {
  it("load returns null and save is a no-op", () => {
    const persistence = createMemoryPersistence();
    expect(persistence.load()).toBeNull();
    persistence.save({
      workers: [],
      overrides: { c1: { aeLevel: 1 } },
      liveEpoch: 1,
    });
    expect(persistence.load()).toBeNull();
  });
});
