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

/** Probe taxes.income / taxes.incomeTax / incomeTax; percent→fraction if >1; default 0. */
export function parseIncomeTaxRate(countryPayload: unknown): number {
  const obj = asRecord(countryPayload);
  if (!obj) return 0;
  const taxes = asRecord(obj.taxes);
  const candidates = [taxes?.income, taxes?.incomeTax, obj.incomeTax, obj.income];
  for (const raw of candidates) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return percentToFraction(raw);
    }
  }
  return 0;
}

/** Resolve company region → country income tax (fraction). Returns 0 when missing. */
export async function fetchIncomeTaxRateForCompany(
  warera: WareraRequester,
  companyId: string,
): Promise<number> {
  const company = await fetchCompanyById(warera, companyId);
  if (!company?.regionId) return 0;

  const regionJson = await warera.request<unknown>(
    wareraProcedurePath("region.getById", { regionId: company.regionId }),
  );
  const region = asRecord(unwrapTrpcData(regionJson)) ?? {};
  const countryId = pickString(region, ["country", "countryId"]);

  if (countryId) {
    const countryJson = await warera.request<unknown>(
      wareraProcedurePath("country.getCountryById", { countryId }),
    );
    return parseIncomeTaxRate(unwrapTrpcData(countryJson));
  }

  const countryCode = pickString(region, ["countryCode", "code"]);
  if (!countryCode) return 0;

  const allJson = await warera.request<unknown>(wareraProcedurePath("country.getAllCountries"));
  const all = unwrapTrpcData(allJson);
  if (!Array.isArray(all)) return 0;
  const match = all.find((row) => {
    const rec = asRecord(row);
    if (!rec) return false;
    const code = pickString(rec, ["code", "isoCode", "countryCode"]);
    return code != null && code.toLowerCase() === countryCode.toLowerCase();
  });
  return parseIncomeTaxRate(match);
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

    const incomeTaxRate = await fetchIncomeTaxRateForCompany(warera, companyId);
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
