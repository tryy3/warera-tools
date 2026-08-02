import { describe, expect, it, vi } from "vite-plus/test";
import { parseIncomeTaxRate, resolveJobWage } from "./job-wage";

describe("parseIncomeTaxRate", () => {
  it("reads taxes.income percent as fraction when > 1", () => {
    expect(parseIncomeTaxRate({ taxes: { income: 7 } })).toBe(0.07);
  });

  it("keeps fraction when already <= 1", () => {
    expect(parseIncomeTaxRate({ taxes: { income: 0.05 } })).toBe(0.05);
  });

  it("probes taxes.incomeTax and top-level incomeTax", () => {
    expect(parseIncomeTaxRate({ taxes: { incomeTax: 10 } })).toBe(0.1);
    expect(parseIncomeTaxRate({ incomeTax: 3 })).toBe(0.03);
  });

  it("defaults to 0", () => {
    expect(parseIncomeTaxRate(null)).toBe(0);
    expect(parseIncomeTaxRate({})).toBe(0);
  });
});

function trpc(data: unknown) {
  return { result: { data } };
}

describe("resolveJobWage", () => {
  it("resolves net wage with income tax", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserById")) return trpc({ company: "co-1" });
      if (path.includes("worker.getWorkers")) {
        return trpc([{ userId: "u1", wagePerPp: 1, companyId: "co-1" }]);
      }
      if (path.includes("company.getById")) {
        return trpc({
          _id: "co-1",
          name: "Mine",
          region: "reg-1",
          itemCode: "lead",
          activeUpgradeLevels: { automatedEngine: 1 },
        });
      }
      if (path.includes("region.getById")) {
        return trpc({ name: "Somewhere", countryCode: "se", country: "country-1" });
      }
      if (path.includes("country.getCountryById")) {
        return trpc({ _id: "country-1", code: "se", taxes: { income: 10, market: 1 } });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const job = await resolveJobWage({ request } as never, "u1");
    expect(job).toEqual({
      status: "resolved",
      companyId: "co-1",
      grossWage: 1,
      incomeTaxRate: 0.1,
      netWage: 0.9,
    });
  });

  it("returns unemployed when no company and no worker row", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserById")) return trpc({ company: null });
      if (path.includes("worker.getWorkers")) return trpc([]);
      throw new Error(`unexpected path ${path}`);
    });
    await expect(resolveJobWage({ request } as never, "u1")).resolves.toEqual({
      status: "unemployed",
    });
  });

  it("falls back to workOffer wage when worker row wage missing", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserById")) return trpc({ company: "co-1" });
      if (path.includes("worker.getWorkers")) {
        return trpc([{ userId: "other", wagePerPp: 9, companyId: "co-1" }]);
      }
      if (path.includes("workOffer.getWorkOfferByCompanyId")) {
        return trpc({ wagePerPp: 0.5 });
      }
      if (path.includes("company.getById")) {
        return trpc({
          _id: "co-1",
          name: "Mine",
          region: "reg-1",
          itemCode: "lead",
          activeUpgradeLevels: { automatedEngine: 1 },
        });
      }
      if (path.includes("region.getById")) {
        return trpc({ name: "Somewhere", countryCode: "bo", country: "country-1" });
      }
      if (path.includes("country.getCountryById")) {
        return trpc({ taxes: { income: 0 } });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const job = await resolveJobWage({ request } as never, "u1");
    expect(job.status).toBe("resolved");
    expect(job.grossWage).toBe(0.5);
    expect(job.netWage).toBe(0.5);
    expect(job.incomeTaxRate).toBe(0);
  });

  it("soft-fails to lookupFailed on throw", async () => {
    const request = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(resolveJobWage({ request } as never, "u1")).resolves.toEqual({
      status: "lookupFailed",
    });
  });

  it("uses worker companyId when user.company is missing", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserById")) return trpc({});
      if (path.includes("worker.getWorkers") && path.includes("userId")) {
        return trpc([{ userId: "u1", wagePerPp: 2, companyId: "co-9" }]);
      }
      if (path.includes("company.getById")) {
        return trpc({
          _id: "co-9",
          name: "Factory",
          region: "reg-1",
          itemCode: "iron",
          activeUpgradeLevels: { automatedEngine: 1 },
        });
      }
      if (path.includes("region.getById")) {
        return trpc({ country: "country-1", countryCode: "xx" });
      }
      if (path.includes("country.getCountryById")) {
        return trpc({ taxes: { income: 20 } });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const job = await resolveJobWage({ request } as never, "u1");
    expect(job).toEqual({
      status: "resolved",
      companyId: "co-9",
      grossWage: 2,
      incomeTaxRate: 0.2,
      netWage: 1.6,
    });
  });
});
