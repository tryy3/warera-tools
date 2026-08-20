import { describe, expect, it, vi } from "vite-plus/test";
import {
  WORK_STATS_DAYS,
  fetchWorkStatsBatch,
  parseCompanyWorkDays,
  parseWorkerWorkDays,
} from "./work-stats";

const companyRow = {
  automatedEngine: 171,
  dailyDate: "2026-08-19",
  employeeProd: 1221.75,
  selfWork: 49.45,
  total: 1442.2,
  wage: 130.287,
};

const workerRow = {
  dailyDate: "2026-08-16",
  employeeProd: 65,
  total: 65,
  wage: 6.8500000000000005,
};

describe("parseCompanyWorkDays", () => {
  it("maps the spec payload with all numeric fields", () => {
    const days = parseCompanyWorkDays([companyRow]);
    expect(days).toEqual([
      {
        dailyDate: "2026-08-19",
        automatedEngine: 171,
        employeeProd: 1221.75,
        selfWork: 49.45,
        total: 1442.2,
        wage: 130.287,
        payload: companyRow,
      },
    ]);
  });

  it("skips rows without a string dailyDate", () => {
    const days = parseCompanyWorkDays([
      companyRow,
      { ...companyRow, dailyDate: undefined },
      { ...companyRow, dailyDate: 123 },
      null,
      "not-an-object",
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]!.dailyDate).toBe("2026-08-19");
  });

  it("coerces missing / non-finite numeric fields to null", () => {
    const days = parseCompanyWorkDays([
      { dailyDate: "2026-08-20", automatedEngine: "x", total: NaN },
    ]);
    expect(days[0]).toMatchObject({
      dailyDate: "2026-08-20",
      automatedEngine: null,
      employeeProd: null,
      selfWork: null,
      total: null,
      wage: null,
    });
  });

  it("returns [] for non-array input", () => {
    expect(parseCompanyWorkDays(null)).toEqual([]);
    expect(parseCompanyWorkDays({ result: { data: [companyRow] } })).toEqual([]);
  });
});

describe("parseWorkerWorkDays", () => {
  it("maps the spec payload with all numeric fields", () => {
    const days = parseWorkerWorkDays([workerRow]);
    expect(days).toEqual([
      {
        dailyDate: "2026-08-16",
        employeeProd: 65,
        total: 65,
        wage: 6.8500000000000005,
        payload: workerRow,
      },
    ]);
  });

  it("skips rows without a string dailyDate", () => {
    const days = parseWorkerWorkDays([
      workerRow,
      { ...workerRow, dailyDate: "" },
      { ...workerRow, dailyDate: null },
    ]);
    expect(days).toHaveLength(1);
  });

  it("coerces missing numeric fields to null", () => {
    const days = parseWorkerWorkDays([{ dailyDate: "2026-08-17" }]);
    expect(days[0]).toMatchObject({
      dailyDate: "2026-08-17",
      employeeProd: null,
      total: null,
      wage: null,
    });
  });
});

describe("fetchWorkStatsBatch", () => {
  it("throws when requestBatch is missing", async () => {
    await expect(
      fetchWorkStatsBatch({ request: vi.fn() }, { companyIds: [], workerTargets: [] }),
    ).rejects.toThrow(/requestBatch/);
  });

  it("POSTs work.getStats procedures to api2 with the right items and init", async () => {
    const requestBatch = vi.fn().mockResolvedValue([
      { ok: true, data: [companyRow] },
      { ok: false, error: { message: "nope" } },
      { ok: true, data: [workerRow] },
    ]);

    const { companies, workers } = await fetchWorkStatsBatch(
      { request: vi.fn(), requestBatch },
      {
        companyIds: ["c1", "c2"],
        workerTargets: [{ companyId: "c1", workerId: "w1" }],
      },
    );

    expect(requestBatch).toHaveBeenCalledTimes(1);
    const [items, init] = requestBatch.mock.calls[0]!;
    expect(items).toEqual([
      { procedure: "work.getStatsByCompany", input: { companyId: "c1", days: WORK_STATS_DAYS } },
      { procedure: "work.getStatsByCompany", input: { companyId: "c2", days: WORK_STATS_DAYS } },
      {
        procedure: "work.getStatsByWorkerAndCompany",
        input: { companyId: "c1", workerId: "w1", days: WORK_STATS_DAYS },
      },
    ]);
    expect(init).toMatchObject({
      method: "POST",
      authStyle: "api-key",
    });
    expect(typeof init.baseUrl).toBe("string");
    expect(init.baseUrl).toContain("api2.warera.io");

    expect(companies.get("c1")).toEqual([
      expect.objectContaining({ dailyDate: "2026-08-19", total: 1442.2 }),
    ]);
    expect(companies.get("c2")).toBeNull();
    expect(workers.get("c1\tw1")).toEqual([
      expect.objectContaining({ dailyDate: "2026-08-16", total: 65 }),
    ]);
  });

  it("returns null maps on whole-batch failure", async () => {
    const requestBatch = vi.fn().mockRejectedValue(new Error("network down"));
    const { companies, workers } = await fetchWorkStatsBatch(
      { request: vi.fn(), requestBatch },
      { companyIds: ["c1"], workerTargets: [{ companyId: "c1", workerId: "w1" }] },
    );
    expect(companies.get("c1")).toBeNull();
    expect(workers.get("c1\tw1")).toBeNull();
  });

  it("returns empty maps for no targets without calling requestBatch", async () => {
    const requestBatch = vi.fn();
    const { companies, workers } = await fetchWorkStatsBatch(
      { request: vi.fn(), requestBatch },
      { companyIds: [], workerTargets: [] },
    );
    expect(requestBatch).not.toHaveBeenCalled();
    expect(companies.size).toBe(0);
    expect(workers.size).toBe(0);
  });
});
