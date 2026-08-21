import { API2_TRPC_BASE } from "./client";
import { isWareraGetRejectedError } from "./errors";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "./prices";
import type { WareraBatchItem } from "./trpc";

export const WORK_STATS_DAYS = 14;

export type CompanyWorkDay = {
  dailyDate: string;
  automatedEngine: number | null;
  employeeProd: number | null;
  selfWork: number | null;
  total: number | null;
  wage: number | null;
  payload: Record<string, unknown> | null;
};

export type WorkerWorkDay = {
  dailyDate: string;
  employeeProd: number | null;
  total: number | null;
  wage: number | null;
  payload: Record<string, unknown> | null;
};

function pickNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseWorkDayRows<T>(
  raw: unknown,
  mapRow: (obj: Record<string, unknown>, dailyDate: string) => T,
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const row of raw) {
    const obj = asRecord(row);
    if (!obj) continue;
    const dailyDate = obj.dailyDate;
    if (typeof dailyDate !== "string" || dailyDate.length === 0) continue;
    out.push(mapRow(obj, dailyDate));
  }
  return out;
}

/**
 * Parse a `work.getStatsByCompany` day array. Rows without a string `dailyDate`
 * are skipped. Missing numeric fields become null. `payload` preserves the raw
 * row for diagnostics.
 */
export function parseCompanyWorkDays(raw: unknown): CompanyWorkDay[] {
  return parseWorkDayRows(raw, (obj, dailyDate) => ({
    dailyDate,
    automatedEngine: pickNum(obj.automatedEngine),
    employeeProd: pickNum(obj.employeeProd),
    selfWork: pickNum(obj.selfWork),
    total: pickNum(obj.total),
    wage: pickNum(obj.wage),
    payload: obj,
  }));
}

/**
 * Parse a `work.getStatsByWorkerAndCompany` day array. Rows without a string
 * `dailyDate` are skipped. Missing numeric fields become null. `payload`
 * preserves the raw row for diagnostics.
 */
export function parseWorkerWorkDays(raw: unknown): WorkerWorkDay[] {
  return parseWorkDayRows(raw, (obj, dailyDate) => ({
    dailyDate,
    employeeProd: pickNum(obj.employeeProd),
    total: pickNum(obj.total),
    wage: pickNum(obj.wage),
    payload: obj,
  }));
}

const WORK_STATS_BATCH_INIT = {
  authStyle: "api-key" as const,
  baseUrl: API2_TRPC_BASE,
};

/**
 * Prefer GET batch; fall back to POST JSON when GET is rejected (these
 * procedures are undocumented and may require POST on api2).
 */
async function requestWorkStatsBatch(
  warera: NonNullable<WareraRequester["requestBatch"]>,
  items: WareraBatchItem[],
  logger?: Logger,
) {
  try {
    return await warera(items, { ...WORK_STATS_BATCH_INIT, method: "GET" });
  } catch (err) {
    if (!isWareraGetRejectedError(err)) throw err;
    logger?.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "work stats GET batch rejected; retrying with POST",
    );
    return await warera(items, { ...WORK_STATS_BATCH_INIT, method: "POST" });
  }
}

/**
 * Batch-fetch daily work stats from api2 via GET (POST fallback) + X-API-Key.
 *
 * Procedures `work.getStatsByCompany` and `work.getStatsByWorkerAndCompany`
 * are not on the official OpenAPI; they require api2 + `X-API-Key`
 * (same class as `company.getRecommendedRegionIdsByItemCode`).
 *
 * The batch layer (`requestBatch` + `parseTrpcBatchResponse`) unwraps each
 * slot's `result.data` to the day array; the parsers therefore receive the
 * array directly. Per-slot failures map to `null`; a whole-batch failure maps
 * every slot to `null` and is logged when a logger is provided.
 *
 * Worker map keys are `${companyId}\t${workerId}`.
 */
export async function fetchWorkStatsBatch(
  warera: WareraRequester,
  input: {
    companyIds: string[];
    workerTargets: { companyId: string; workerId: string }[];
  },
  options?: { logger?: Logger },
): Promise<{
  companies: Map<string, CompanyWorkDay[] | null>;
  workers: Map<string, WorkerWorkDay[] | null>;
}> {
  if (!warera.requestBatch) {
    throw new Error("fetchWorkStatsBatch requires warera.requestBatch");
  }

  const companyItems = input.companyIds.map((companyId) => ({
    procedure: "work.getStatsByCompany",
    input: { companyId, days: WORK_STATS_DAYS },
  }));
  const workerItems = input.workerTargets.map(({ companyId, workerId }) => ({
    procedure: "work.getStatsByWorkerAndCompany",
    input: { companyId, workerId, days: WORK_STATS_DAYS },
  }));

  const companies = new Map<string, CompanyWorkDay[] | null>();
  const workers = new Map<string, WorkerWorkDay[] | null>();

  for (const companyId of input.companyIds) companies.set(companyId, null);
  for (const target of input.workerTargets) {
    workers.set(`${target.companyId}\t${target.workerId}`, null);
  }

  if (companyItems.length === 0 && workerItems.length === 0) {
    return { companies, workers };
  }

  const items = [...companyItems, ...workerItems];
  try {
    const slots = await requestWorkStatsBatch(warera.requestBatch, items, options?.logger);

    for (let i = 0; i < companyItems.length; i++) {
      const companyId = input.companyIds[i]!;
      const slot = slots[i];
      if (!slot?.ok) continue;
      try {
        companies.set(companyId, parseCompanyWorkDays(slot.data));
      } catch {
        companies.set(companyId, null);
      }
    }
    for (let j = 0; j < workerItems.length; j++) {
      const target = input.workerTargets[j]!;
      const slot = slots[companyItems.length + j];
      if (!slot?.ok) continue;
      try {
        workers.set(`${target.companyId}\t${target.workerId}`, parseWorkerWorkDays(slot.data));
      } catch {
        workers.set(`${target.companyId}\t${target.workerId}`, null);
      }
    }
  } catch (err) {
    options?.logger?.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        company_count: input.companyIds.length,
        worker_count: input.workerTargets.length,
      },
      "work stats batch failed",
    );
  }

  return { companies, workers };
}
