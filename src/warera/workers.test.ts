import { describe, expect, it, vi } from "vite-plus/test";
import {
  fetchWorkOfferWage,
  fetchWorkers,
  parseWorkOfferWage,
  parseWorkers,
} from "./workers";

describe("parseWorkers", () => {
  it("maps userId and wagePerPp from array rows", () => {
    expect(
      parseWorkers([
        { userId: "u1", wagePerPp: 0.42 },
        { user: "u2", wage: 1.5, companyId: "co-1" },
      ]),
    ).toEqual([
      { userId: "u1", wagePerPp: 0.42, companyId: null },
      { userId: "u2", wagePerPp: 1.5, companyId: "co-1" },
    ]);
  });

  it("unwraps items / workers containers", () => {
    expect(
      parseWorkers({
        workers: [{ _id: "u3", wagePerPP: 2 }],
      }),
    ).toEqual([{ userId: "u3", wagePerPp: 2, companyId: null }]);
  });

  it("skips rows without user or wage", () => {
    expect(parseWorkers([{ userId: "u1" }, { wagePerPp: 1 }, null])).toEqual([]);
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
    const request = vi.fn(async () => ({
      result: { data: [{ userId: "u1", wagePerPp: 0.5, companyId: "co-1" }] },
    }));
    const rows = await fetchWorkers({ request } as never, { userId: "u1", companyId: "co-1" });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("worker.getWorkers"));
    expect(request.mock.calls[0]![0]).toContain("userId");
    expect(request.mock.calls[0]![0]).toContain("companyId");
    expect(rows).toEqual([{ userId: "u1", wagePerPp: 0.5, companyId: "co-1" }]);
  });

  it("calls workOffer.getWorkOfferByCompanyId", async () => {
    const request = vi.fn(async () => ({
      result: { data: { wagePerPp: 0.33 } },
    }));
    const wage = await fetchWorkOfferWage({ request } as never, "co-1");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("workOffer.getWorkOfferByCompanyId"),
    );
    expect(wage).toBe(0.33);
  });
});
