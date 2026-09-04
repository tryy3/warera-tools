import { describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../db/client";
import { USER_PROFILE_JOB_MAX_AGE_MS } from "../db/user-profiles";
import { resolveUserByIdRef } from "../user/resolve-user-by-id";
import {
  fetchIncomeTaxRateForCompany,
  parseIncomeTaxRate,
  parseIncomeTaxRateResult,
  resolveJobWage,
} from "./job-wage";

vi.mock("../user/resolve-user-by-id", () => ({
  resolveUserByIdRef: vi.fn(),
}));

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

describe("parseIncomeTaxRateResult", () => {
  it("marks assumed when country/tax fields are absent", () => {
    expect(parseIncomeTaxRateResult(null)).toEqual({ rate: 0, assumed: true });
    expect(parseIncomeTaxRateResult({})).toEqual({ rate: 0, assumed: true });
    expect(parseIncomeTaxRateResult({ taxes: {} })).toEqual({ rate: 0, assumed: true });
  });

  it("keeps explicit income 0 as not assumed", () => {
    expect(parseIncomeTaxRateResult({ taxes: { income: 0 } })).toEqual({
      rate: 0,
      assumed: false,
    });
  });
});

function trpc(data: unknown) {
  return { result: { data } };
}

describe("fetchIncomeTaxRateForCompany", () => {
  it("resolves country income tax via company region", async () => {
    const request = vi.fn(async (path: string) => {
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
        return trpc({ country: "country-1", countryCode: "se" });
      }
      if (path.includes("country.getCountryById")) {
        return trpc({ taxes: { income: 15 } });
      }
      throw new Error(`unexpected path ${path}`);
    });

    await expect(fetchIncomeTaxRateForCompany({ request } as never, "co-1")).resolves.toEqual({
      rate: 0.15,
      assumed: false,
    });
  });
});

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

    const job = await resolveJobWage({ warera: { request } as never, userId: "u1" });
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
    await expect(resolveJobWage({ warera: { request } as never, userId: "u1" })).resolves.toEqual({
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

    const job = await resolveJobWage({ warera: { request } as never, userId: "u1" });
    expect(job.status).toBe("resolved");
    expect(job.grossWage).toBe(0.5);
    expect(job.netWage).toBe(0.5);
    expect(job.incomeTaxRate).toBe(0);
  });

  it("uses workOffer when matched worker has companyId but no wage", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserById")) return trpc({});
      if (path.includes("worker.getWorkers")) {
        return trpc([{ userId: "u1", companyId: "co-7" }]);
      }
      if (path.includes("workOffer.getWorkOfferByCompanyId")) {
        return trpc({ wagePerPp: 0.75 });
      }
      if (path.includes("company.getById")) {
        return trpc({
          _id: "co-7",
          name: "Mill",
          region: "reg-1",
          itemCode: "wood",
          activeUpgradeLevels: { automatedEngine: 1 },
        });
      }
      if (path.includes("region.getById")) {
        return trpc({ country: "country-1", countryCode: "xx" });
      }
      if (path.includes("country.getCountryById")) {
        return trpc({ taxes: { income: 0 } });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const job = await resolveJobWage({ warera: { request } as never, userId: "u1" });
    expect(job).toEqual({
      status: "resolved",
      companyId: "co-7",
      grossWage: 0.75,
      incomeTaxRate: 0,
      netWage: 0.75,
    });
  });

  it("soft-fails to lookupFailed on throw", async () => {
    const request = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(resolveJobWage({ warera: { request } as never, userId: "u1" })).resolves.toEqual({
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

    const job = await resolveJobWage({ warera: { request } as never, userId: "u1" });
    expect(job).toEqual({
      status: "resolved",
      companyId: "co-9",
      grossWage: 2,
      incomeTaxRate: 0.2,
      netWage: 1.6,
    });
  });

  it("uses the profile resolver with the job freshness default when db is provided", async () => {
    const db = {} as Db;
    const now = new Date("2026-09-04T12:00:00.000Z");
    const request = vi.fn(async (path: string) => {
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
        return trpc({ country: "country-1" });
      }
      if (path.includes("country.getCountryById")) {
        return trpc({ taxes: { income: 0 } });
      }
      throw new Error(`unexpected path ${path}`);
    });
    vi.mocked(resolveUserByIdRef).mockResolvedValue({
      userId: "u1",
      username: "Alice",
      muId: null,
      companyId: "co-1",
    });

    await expect(
      resolveJobWage({ warera: { request } as never, userId: "u1", db, now }),
    ).resolves.toMatchObject({ status: "resolved", companyId: "co-1" });

    expect(resolveUserByIdRef).toHaveBeenCalledWith({
      db,
      warera: { request },
      userId: "u1",
      maxAgeMs: USER_PROFILE_JOB_MAX_AGE_MS,
      now,
    });
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining("user.getUserById"));
  });
});
