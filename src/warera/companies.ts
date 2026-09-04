import { formatDisplayNumber } from "../lib/formatDisplayNumber";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";
import type { WareraRequester } from "./prices";

export type CompanySummary = {
  id: string;
  name: string;
  itemCode: string | null;
  regionId: string | null;
  regionName: string | null;
  regionCountryCode: string | null;
  aeLevel: number;
  productionBonus: number | null;
};

export type RegionInfo = {
  name: string | null;
  countryCode: string | null;
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

function nestedNumber(obj: Record<string, unknown>, path: string[]): number | null {
  let cur: unknown = obj;
  for (const key of path) {
    const rec = asRecord(cur);
    if (!rec) return null;
    cur = rec[key];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : null;
}

export function parseCompany(raw: unknown): CompanySummary | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, ["_id", "id", "companyId"]);
  if (!id) return null;

  const itemCode =
    pickString(obj, ["itemCode", "productionType", "type", "resource"]) ??
    pickString(asRecord(obj.production) ?? {}, ["itemCode", "type"]);

  const regionId =
    pickString(obj, ["regionId", "region"]) ??
    pickString(asRecord(obj.region) ?? {}, ["_id", "id"]);

  const regionName =
    pickString(obj, ["regionName"]) ?? pickString(asRecord(obj.region) ?? {}, ["name"]);

  const aeLevel =
    pickNumber(obj, ["automatedEngineLevel", "aeLevel", "engineLevel"]) ??
    nestedNumber(obj, ["activeUpgradeLevels", "automatedEngine"]) ??
    nestedNumber(obj, ["upgrades", "automatedEngine", "level"]) ??
    nestedNumber(obj, ["upgrades", "engine", "level"]) ??
    nestedNumber(obj, ["engine", "level"]) ??
    1;

  const productionBonus =
    pickNumber(obj, ["productionBonus", "bonus"]) ??
    nestedNumber(obj, ["productionBonus", "total"]) ??
    nestedNumber(obj, ["bonus", "production"]);

  return {
    id,
    name: pickString(obj, ["name", "companyName"]) ?? id,
    itemCode,
    regionId,
    regionName,
    regionCountryCode: null,
    aeLevel: Math.max(1, Math.min(7, Math.trunc(aeLevel))),
    productionBonus:
      productionBonus == null
        ? null
        : productionBonus > 1
          ? productionBonus / 100
          : productionBonus,
  };
}

/** `getCompanies` returns `{ items: string[] }` (ids) or occasionally object rows. */
export function extractCompanyIds(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.flatMap((item) => {
      if (typeof item === "string" && item.length > 0) return [item];
      const obj = asRecord(item);
      const id = obj ? pickString(obj, ["_id", "id", "companyId"]) : null;
      return id ? [id] : [];
    });
  }
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of ["items", "companies", "data", "results"]) {
    if (Array.isArray(obj[key])) return extractCompanyIds(obj[key]);
  }
  return [];
}

export async function fetchCompaniesByUserId(
  warera: WareraRequester,
  userId: string,
): Promise<CompanySummary[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const input: Record<string, unknown> = { userId, perPage: 100 };
    if (cursor) input.cursor = cursor;
    const json = await warera.request<unknown>(wareraProcedurePath("company.getCompanies", input));
    const data = unwrapTrpcData(json);
    const pageIds = extractCompanyIds(data);
    ids.push(...pageIds);
    const obj = asRecord(data);
    const next =
      (obj && typeof obj.nextCursor === "string" && obj.nextCursor) ||
      (obj && typeof obj.cursor === "string" && obj.cursor) ||
      null;
    if (!next || pageIds.length === 0) break;
    cursor = next;
  }

  const companies: CompanySummary[] = [];
  for (const companyId of ids) {
    const company = await fetchCompanyById(warera, companyId);
    if (company) companies.push(company);
  }
  return companies;
}

export async function fetchCompanyById(
  warera: WareraRequester,
  companyId: string,
): Promise<CompanySummary | null> {
  const json = await warera.request<unknown>(wareraProcedurePath("company.getById", { companyId }));
  return parseCompany(unwrapTrpcData(json));
}

/** Bonus as fraction. Auth-required explorer endpoint. */
export type ProductionBonusDetails = {
  /** Fraction, e.g. 0.505 */
  total: number;
  strategicBonus: number;
  depositBonus: number;
  ethicSpecializationBonus: number;
  ethicDepositBonus: number;
  formula: string;
};

function percentToFraction(value: number): number {
  return value > 1 ? value / 100 : value;
}

export async function fetchCompanyProductionBonus(
  warera: WareraRequester,
  companyId: string,
): Promise<ProductionBonusDetails | null> {
  try {
    const json = await warera.request<unknown>(
      wareraProcedurePath("company.getProductionBonus", { companyId }),
    );
    const data = unwrapTrpcData(json);
    const obj = asRecord(data);
    if (!obj) return null;
    const totalRaw =
      pickNumber(obj, ["total", "productionBonus", "bonus", "value"]) ??
      nestedNumber(obj, ["bonus", "total"]) ??
      nestedNumber(obj, ["productionBonus", "total"]);
    if (totalRaw == null) return null;
    const strategicBonus = percentToFraction(pickNumber(obj, ["strategicBonus"]) ?? 0);
    const depositBonus = percentToFraction(pickNumber(obj, ["depositBonus"]) ?? 0);
    const ethicSpecializationBonus = percentToFraction(
      pickNumber(obj, ["ethicSpecializationBonus"]) ?? 0,
    );
    const ethicDepositBonus = percentToFraction(pickNumber(obj, ["ethicDepositBonus"]) ?? 0);
    const total = percentToFraction(totalRaw);
    return {
      total,
      strategicBonus,
      depositBonus,
      ethicSpecializationBonus,
      ethicDepositBonus,
      formula: `strategic ${formatDisplayNumber(strategicBonus * 100)}% + deposit ${formatDisplayNumber(depositBonus * 100)}% + ethics ${formatDisplayNumber(ethicSpecializationBonus * 100)}% + ethics-deposit ${formatDisplayNumber(ethicDepositBonus * 100)}% = ${formatDisplayNumber(total * 100)}%`,
    };
  } catch {
    return null;
  }
}

export function parseRegionInfo(data: unknown): RegionInfo {
  const obj = asRecord(data);
  if (!obj) return { name: null, countryCode: null };
  return {
    name: pickString(obj, ["name", "mainCity"]),
    countryCode: pickString(obj, ["countryCode"]),
  };
}

export async function fetchRegionInfo(
  warera: WareraRequester,
  regionId: string,
): Promise<RegionInfo> {
  try {
    return await fetchRegionInfoOrThrow(warera, regionId);
  } catch {
    return { name: null, countryCode: null };
  }
}

/** Throws on upstream failure — used by region-sync job. */
export async function fetchRegionInfoOrThrow(
  warera: WareraRequester,
  regionId: string,
): Promise<RegionInfo> {
  const json = await warera.request<unknown>(wareraProcedurePath("region.getById", { regionId }));
  return parseRegionInfo(unwrapTrpcData(json));
}

export async function fetchRegionName(
  warera: WareraRequester,
  regionId: string,
): Promise<string | null> {
  const info = await fetchRegionInfo(warera, regionId);
  return info.name;
}

export type RecommendedRegion = {
  regionId: string;
  regionName: string | null;
  /** Bonus as fraction. */
  bonus: number;
};

export function parseRecommendedRegions(trpcJson: unknown): RecommendedRegion[] {
  const data = unwrapTrpcData(trpcJson);
  let list: unknown[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else {
    const obj = asRecord(data);
    if (obj) {
      for (const key of ["regions", "recommendedRegions", "regionIds", "items", "result", "ids"]) {
        if (Array.isArray(obj[key])) {
          list = obj[key] as unknown[];
          break;
        }
      }
    }
  }
  const out: RecommendedRegion[] = [];
  for (const raw of list) {
    // Some responses are bare region id strings (ranked).
    if (typeof raw === "string" && raw.length > 0) {
      out.push({ regionId: raw, regionName: null, bonus: 0 });
      continue;
    }
    const obj = asRecord(raw);
    if (!obj) continue;
    const regionId = pickString(obj, ["regionId", "_id", "id"]);
    if (!regionId) continue;
    const bonusRaw =
      pickNumber(obj, ["bonus", "productionBonus", "totalBonus", "total", "value"]) ??
      nestedNumber(obj, ["productionBonus", "total"]);
    out.push({
      regionId,
      regionName: pickString(obj, ["name", "regionName"]),
      bonus: bonusRaw == null ? 0 : bonusRaw > 1 ? bonusRaw / 100 : bonusRaw,
    });
  }
  return out;
}

export async function fetchBestRecommendedRegion(
  warera: WareraRequester,
  itemCode: string,
): Promise<RecommendedRegion | null> {
  // Not in OpenAPI (still official on api2); requires POST + X-API-Key + JSON body
  // (Bearer does not work). Client auto also sends X-API-Key when a key is set.
  const json = await warera.request<unknown>("company.getRecommendedRegionIdsByItemCode", {
    method: "POST",
    json: { itemCode, count: 1 },
    authStyle: "api-key",
  });
  const regions = parseRecommendedRegions(json);
  return regions[0] ?? null;
}
