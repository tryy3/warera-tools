import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type WareraCountryRow = {
  id: string;
  name: string;
  isoCode: string;
  taxRate: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseCountryRow(raw: unknown): WareraCountryRow | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const id = typeof obj._id === "string" && obj._id.length > 0 ? obj._id : null;
  const name = typeof obj.name === "string" && obj.name.length > 0 ? obj.name : null;
  const code = typeof obj.code === "string" && obj.code.trim().length > 0 ? obj.code : null;
  if (!id || !name || !code) return null;

  const taxes = asRecord(obj.taxes);
  const marketTax = taxes?.market;
  const taxRate =
    typeof marketTax === "number" && Number.isFinite(marketTax) ? marketTax / 100 : 0;

  return {
    id,
    name,
    isoCode: code.trim().toUpperCase(),
    taxRate,
  };
}

export function parseWareraCountries(trpcJson: unknown): WareraCountryRow[] {
  const data = unwrapTrpcData<unknown>(trpcJson);
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = parseCountryRow(row);
    return parsed ? [parsed] : [];
  });
}

export async function fetchAllCountries(warera: WareraRequester): Promise<WareraCountryRow[]> {
  const json = await warera.request<unknown>(wareraProcedurePath("country.getAllCountries"));
  return parseWareraCountries(json);
}
