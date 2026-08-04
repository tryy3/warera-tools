import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type WorkerRow = {
  userId: string;
  username: string | null;
  wagePerPp: number | null;
  companyId: string | null;
  energyLevel: number | null;
  productionLevel: number | null;
  fidelityPct: number | null;
  assumedFields: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function pickWage(obj: Record<string, unknown>): number | null {
  return pickNumber(obj, ["wagePerPp", "wagePerPP", "wage", "wagePerProductionPoint"]);
}

function extractWorkerList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of ["workers", "items", "data", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

export function parseWorkers(data: unknown): WorkerRow[] {
  const out: WorkerRow[] = [];
  for (const raw of extractWorkerList(data)) {
    const obj = asRecord(raw);
    if (!obj) continue;
    const userId = pickString(obj, ["userId", "user", "_id", "id"]);
    if (!userId) continue;
    const wagePerPp = pickWage(obj);
    const companyNested = asRecord(obj.company);
    const companyId =
      pickString(obj, ["companyId", "company"]) ??
      (companyNested ? pickString(companyNested, ["_id", "id", "companyId"]) : null);
    out.push({
      userId,
      username: pickString(obj, ["username", "userName"]),
      wagePerPp,
      companyId,
      energyLevel: pickNumber(obj, ["energyLevel", "energy"]),
      productionLevel: pickNumber(obj, ["productionLevel", "production"]),
      fidelityPct: pickNumber(obj, ["fidelityPct", "fidelity", "fidelityBonus"]),
      assumedFields: [],
    });
  }
  return out;
}

export function parseWorkOfferWage(data: unknown): number | null {
  const obj = asRecord(data);
  if (!obj) return null;
  return pickWage(obj);
}

export async function fetchWorkers(
  warera: WareraRequester,
  input: { companyId?: string; userId?: string },
  options?: { onFirstRawKeys?: (keys: string[]) => void },
): Promise<WorkerRow[]> {
  const body: Record<string, string> = {};
  if (input.companyId) body.companyId = input.companyId;
  if (input.userId) body.userId = input.userId;
  const json = await warera.request<unknown>(wareraProcedurePath("worker.getWorkers", body));
  const data = unwrapTrpcData(json);
  if (options?.onFirstRawKeys) {
    const first = asRecord(extractWorkerList(data)[0]);
    if (first) options.onFirstRawKeys(Object.keys(first));
  }
  return parseWorkers(data);
}

export async function fetchWorkOfferWage(
  warera: WareraRequester,
  companyId: string,
): Promise<number | null> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("workOffer.getWorkOfferByCompanyId", { companyId }),
  );
  return parseWorkOfferWage(unwrapTrpcData(json));
}
