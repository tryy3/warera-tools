import { describe, expect, it, vi } from "vite-plus/test";
import {
  fetchWorkOfferWage,
  fetchWorkers,
  parseWorkOfferWage,
  parseWorkers,
  workerFieldProvenance,
} from "./workers";

const nullSkillFields = {
  username: null,
  energyLevel: null,
  productionLevel: null,
  fidelityPct: null,
  assumedFields: [] as string[],
};

describe("workerFieldProvenance", () => {
  it("marks null fields as assumed and present numbers as api", () => {
    expect(
      workerFieldProvenance({
        wagePerPp: 0.12,
        energyLevel: null,
        productionLevel: 5,
        fidelityPct: null,
      }),
    ).toEqual({
      wagePerPp: { value: 0.12, source: "api" },
      energyLevel: { value: null, source: "assumed" },
      productionLevel: { value: 5, source: "api" },
      fidelityPct: { value: null, source: "assumed" },
    });
  });
});

describe("parseWorkers", () => {
  it("maps userId and wagePerPp from array rows", () => {
    expect(
      parseWorkers([
        { userId: "u1", wagePerPp: 0.42 },
        { user: "u2", wage: 1.5, companyId: "co-1" },
      ]),
    ).toEqual([
      { userId: "u1", wagePerPp: 0.42, companyId: null, ...nullSkillFields },
      { userId: "u2", wagePerPp: 1.5, companyId: "co-1", ...nullSkillFields },
    ]);
  });

  it("unwraps items / workers containers", () => {
    expect(
      parseWorkers({
        workers: [{ _id: "u3", wagePerPP: 2 }],
      }),
    ).toEqual([{ userId: "u3", wagePerPp: 2, companyId: null, ...nullSkillFields }]);
  });

  it("parses live gateway shape { type, workers } with string user/company ids", () => {
    expect(
      parseWorkers({
        type: "company",
        workers: [
          {
            _id: "worker-doc-1",
            user: "u-live",
            company: "co-live",
            employer: "boss",
            wage: 0.134,
            fidelity: 1,
          },
        ],
      }),
    ).toEqual([
      {
        userId: "u-live",
        wagePerPp: 0.134,
        companyId: "co-live",
        username: null,
        energyLevel: null,
        productionLevel: null,
        fidelityPct: 1,
        assumedFields: [],
      },
    ]);
  });

  it("keeps userId rows when wage is missing (wagePerPp null)", () => {
    expect(parseWorkers([{ userId: "u1", companyId: "co-1" }])).toEqual([
      { userId: "u1", wagePerPp: null, companyId: "co-1", ...nullSkillFields },
    ]);
  });

  it("skips rows without userId", () => {
    expect(parseWorkers([{ wagePerPp: 1 }, null])).toEqual([]);
  });

  it("parses optional skill and fidelity fields when present", () => {
    expect(
      parseWorkers([
        {
          userId: "u1",
          username: "mortada",
          wagePerPp: 0.135,
          companyId: "c1",
          energyLevel: 5,
          productionLevel: 5,
          fidelityPct: 1,
        },
      ]),
    ).toEqual([
      {
        userId: "u1",
        username: "mortada",
        wagePerPp: 0.135,
        companyId: "c1",
        energyLevel: 5,
        productionLevel: 5,
        fidelityPct: 1,
        assumedFields: [],
      },
    ]);
  });

  it("leaves missing skill fields null", () => {
    const [row] = parseWorkers([{ userId: "u1", wagePerPp: 0.1 }]);
    expect(row?.energyLevel).toBeNull();
    expect(row?.username).toBeNull();
    expect(row?.productionLevel).toBeNull();
    expect(row?.fidelityPct).toBeNull();
    expect(row?.assumedFields).toEqual([]);
  });

  it("accepts common key aliases", () => {
    const [row] = parseWorkers([
      {
        userId: "u1",
        userName: "alias-user",
        energy: 3,
        production: 4,
        fidelityBonus: 0.5,
      },
    ]);
    expect(row).toEqual({
      userId: "u1",
      username: "alias-user",
      wagePerPp: null,
      companyId: null,
      energyLevel: 3,
      productionLevel: 4,
      fidelityPct: 0.5,
      assumedFields: [],
    });
  });
});

describe("parseWorkOfferWage", () => {
  it("reads wagePerPp from offer object", () => {
    expect(parseWorkOfferWage({ wagePerPp: 0.8 })).toBe(0.8);
    expect(parseWorkOfferWage({ wage: 1.2 })).toBe(1.2);
    expect(parseWorkOfferWage(null)).toBeNull();
  });
});

describe("fetchWorkers / fetchWorkOfferWage", () => {
  it("calls worker.getWorkers with companyId and/or userId", async () => {
    const request = vi.fn(async (_path: string) => ({
      result: { data: [{ userId: "u1", wagePerPp: 0.5, companyId: "co-1" }] },
    }));
    const rows = await fetchWorkers({ request } as never, { userId: "u1", companyId: "co-1" });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("worker.getWorkers"));
    expect(request.mock.calls[0]![0]).toContain("userId");
    expect(request.mock.calls[0]![0]).toContain("companyId");
    expect(rows).toEqual([{ userId: "u1", wagePerPp: 0.5, companyId: "co-1", ...nullSkillFields }]);
  });

  it("calls workOffer.getWorkOfferByCompanyId", async () => {
    const request = vi.fn(async (_path: string) => ({
      result: { data: { wagePerPp: 0.33 } },
    }));
    const wage = await fetchWorkOfferWage({ request } as never, "co-1");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("workOffer.getWorkOfferByCompanyId"),
    );
    expect(wage).toBe(0.33);
  });

  it("returns null when work offer request fails (e.g. NOT_FOUND)", async () => {
    const request = vi.fn(async () => {
      throw new Error("WarEra request failed: 404 Workoffers not found.");
    });
    await expect(fetchWorkOfferWage({ request } as never, "co-1")).resolves.toBeNull();
  });

  it("returns null when tRPC envelope has error / missing result.data", async () => {
    const request = vi.fn(async () => ({
      error: { message: "Workoffers not found.", data: { code: "NOT_FOUND" } },
    }));
    await expect(fetchWorkOfferWage({ request } as never, "co-1")).resolves.toBeNull();
  });

  it("reads wage from first item when offer payload is an array", async () => {
    const request = vi.fn(async () => ({
      result: { data: [{ wage: 0.21 }, { wage: 0.99 }] },
    }));
    await expect(fetchWorkOfferWage({ request } as never, "co-1")).resolves.toBe(0.21);
  });
});
