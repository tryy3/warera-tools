import { fetchCompanyById } from "../warera/companies";
import type { WareraRequester } from "../warera/prices";
import { unwrapTrpcData, wareraProcedurePath } from "../warera/trpc";
import { fetchUserById } from "../warera/users";
import { fetchWorkOfferWage, fetchWorkers, type WorkerRow } from "../warera/workers";

export type SkillsJob = {
  status: "resolved" | "unemployed" | "lookupFailed";
  companyId?: string;
  grossWage?: number;
  incomeTaxRate?: number;
  netWage?: number;
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

function percentToFraction(value: number): number {
  return value > 1 ? value / 100 : value;
}

export type IncomeTaxRateResult = {
  rate: number;
  /** True when no income-tax field was found (defaulted to 0). Explicit 0 is not assumed. */
  assumed: boolean;
};

const ASSUMED_ZERO_TAX: IncomeTaxRateResult = { rate: 0, assumed: true };

/** Probe taxes.income / taxes.incomeTax / incomeTax; percent→fraction if >1; assumed when absent. */
export function parseIncomeTaxRateResult(countryPayload: unknown): IncomeTaxRateResult {
  const obj = asRecord(countryPayload);
  if (!obj) return ASSUMED_ZERO_TAX;
  const taxes = asRecord(obj.taxes);
  const candidates = [taxes?.income, taxes?.incomeTax, obj.incomeTax, obj.income];
  for (const raw of candidates) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return { rate: percentToFraction(raw), assumed: false };
    }
  }
  return ASSUMED_ZERO_TAX;
}

/** Probe taxes.income / taxes.incomeTax / incomeTax; percent→fraction if >1; default 0. */
export function parseIncomeTaxRate(countryPayload: unknown): number {
  return parseIncomeTaxRateResult(countryPayload).rate;
}

/** Resolve company region → country income tax (fraction). Assumed 0 when missing. */
export async function fetchIncomeTaxRateForCompany(
  warera: WareraRequester,
  companyId: string,
): Promise<IncomeTaxRateResult> {
  const company = await fetchCompanyById(warera, companyId);
  if (!company?.regionId) return ASSUMED_ZERO_TAX;

  const regionJson = await warera.request<unknown>(
    wareraProcedurePath("region.getById", { regionId: company.regionId }),
  );
  const region = asRecord(unwrapTrpcData(regionJson)) ?? {};
  const countryId = pickString(region, ["country", "countryId"]);

  if (countryId) {
    const countryJson = await warera.request<unknown>(
      wareraProcedurePath("country.getCountryById", { countryId }),
    );
    return parseIncomeTaxRateResult(unwrapTrpcData(countryJson));
  }

  const countryCode = pickString(region, ["countryCode", "code"]);
  if (!countryCode) return ASSUMED_ZERO_TAX;

  const allJson = await warera.request<unknown>(wareraProcedurePath("country.getAllCountries"));
  const all = unwrapTrpcData(allJson);
  if (!Array.isArray(all)) return ASSUMED_ZERO_TAX;
  const match = all.find((row) => {
    const rec = asRecord(row);
    if (!rec) return false;
    const code = pickString(rec, ["code", "isoCode", "countryCode"]);
    return code != null && code.toLowerCase() === countryCode.toLowerCase();
  });
  return parseIncomeTaxRateResult(match);
}

function workerForUser(workers: WorkerRow[], userId: string): WorkerRow | undefined {
  return workers.find((w) => w.userId === userId);
}

export async function resolveJobWage(warera: WareraRequester, userId: string): Promise<SkillsJob> {
  try {
    const { companyId: userCompanyId } = await fetchUserById(warera, userId);

    let companyId = userCompanyId;
    let workers: WorkerRow[] = [];

    if (companyId) {
      workers = await fetchWorkers(warera, { companyId, userId });
    } else {
      workers = await fetchWorkers(warera, { userId });
      const row = workerForUser(workers, userId);
      companyId = row?.companyId ?? null;
    }

    const matched = workerForUser(workers, userId);
    if (!companyId && !matched) {
      return { status: "unemployed" };
    }

    if (!companyId) {
      return { status: "lookupFailed" };
    }

    let grossWage = matched?.wagePerPp;
    if (grossWage == null) {
      const offerWage = await fetchWorkOfferWage(warera, companyId);
      if (offerWage == null) {
        return { status: "lookupFailed", companyId };
      }
      grossWage = offerWage;
    }

    const { rate: incomeTaxRate } = await fetchIncomeTaxRateForCompany(warera, companyId);
    const netWage = grossWage * (1 - incomeTaxRate);

    return {
      status: "resolved",
      companyId,
      grossWage,
      incomeTaxRate,
      netWage,
    };
  } catch {
    return { status: "lookupFailed" };
  }
}
