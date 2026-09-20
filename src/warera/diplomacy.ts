import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type ParsedCountryDiplomacy = {
  allianceId: string | null;
  swornEnemyId: string | null;
  swornEnemySince: Date | null;
  pacts: Array<{ countryId: string; since: string }>;
};

export type ParsedWorldDevelopment = {
  totalDevelopment: number | null;
  allianceDevelopmentById: Map<string, number>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function pickDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function pickFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePacts(raw: unknown): Array<{ countryId: string; since: string }> {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw)?.pacts)
      ? (asRecord(raw)!.pacts as unknown[])
      : Array.isArray(asRecord(raw)?.defensivePacts)
        ? (asRecord(raw)!.defensivePacts as unknown[])
        : [];
  const out: Array<{ countryId: string; since: string }> = [];
  for (const row of list) {
    const obj = asRecord(row);
    if (!obj) continue;
    const countryId = pickString(obj, ["countryId", "country", "country_id"]);
    const sinceRaw = obj.since;
    const since =
      typeof sinceRaw === "string" && sinceRaw.length > 0
        ? sinceRaw
        : pickDate(sinceRaw)?.toISOString();
    if (!countryId || !since) continue;
    out.push({ countryId, since });
  }
  return out;
}

function parseSwornEnemy(raw: unknown): { id: string | null; since: Date | null } {
  const obj = asRecord(raw);
  if (!obj) return { id: null, since: null };
  const id = pickString(obj, ["countryId", "country", "country_id", "_id", "id"]);
  return { id, since: pickDate(obj.since) };
}

export function parseCountryDiplomacy(raw: unknown): ParsedCountryDiplomacy {
  const obj = asRecord(raw) ?? {};
  const sworn = parseSwornEnemy(obj.swornEnemy ?? obj.sworn_enemy);
  const allianceId = pickString(obj, ["allianceId", "alliance", "alliance_id"]);
  const pacts = parsePacts(obj.defensivePacts ?? obj.defensive_pacts ?? obj.pacts);
  return {
    allianceId,
    swornEnemyId: sworn.id,
    swornEnemySince: sworn.since,
    pacts,
  };
}

export function parseCountryCapitalRegionId(raw: unknown): string | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  return pickString(obj, ["capitalRegionId", "capitalRegion", "capital", "capital_region_id"]);
}

export function parseWorldDevelopment(raw: unknown): ParsedWorldDevelopment {
  const obj = asRecord(raw) ?? {};
  const totalDevelopment =
    pickFiniteNumber(obj.totalDevelopment) ??
    pickFiniteNumber(obj.total) ??
    pickFiniteNumber(obj.worldDevelopment);
  const allianceDevelopmentById = new Map<string, number>();
  const alliances = obj.alliances ?? obj.allianceTotals ?? obj.items;
  if (Array.isArray(alliances)) {
    for (const row of alliances) {
      const a = asRecord(row);
      if (!a) continue;
      const id = pickString(a, ["_id", "id", "allianceId", "alliance"]);
      const dev =
        pickFiniteNumber(a.development) ??
        pickFiniteNumber(a.totalDevelopment) ??
        pickFiniteNumber(a.value);
      if (id && dev != null) allianceDevelopmentById.set(id, dev);
    }
  }
  return { totalDevelopment, allianceDevelopmentById };
}

export function computeAllianceWorldShare(
  world: ParsedWorldDevelopment,
  allianceId: string | null,
): number | null {
  if (!allianceId) return null;
  const allianceDev = world.allianceDevelopmentById.get(allianceId);
  if (allianceDev == null) return null;
  const total =
    world.totalDevelopment ??
    (world.allianceDevelopmentById.size > 0
      ? [...world.allianceDevelopmentById.values()].reduce((a, b) => a + b, 0)
      : null);
  if (total == null || total <= 0) return null;
  return allianceDev / total;
}

export async function fetchCountryDiplomacy(
  warera: WareraRequester,
  countryId: string,
): Promise<ParsedCountryDiplomacy> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("countryDiplomacy.getByCountry", { countryId }),
  );
  return parseCountryDiplomacy(unwrapTrpcData(json));
}

export async function fetchWorldDevelopment(
  warera: WareraRequester,
): Promise<ParsedWorldDevelopment> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("gameStat.getWorldDevelopment"),
  );
  return parseWorldDevelopment(unwrapTrpcData(json));
}

export async function fetchCountryCapitalRegionId(
  warera: WareraRequester,
  countryId: string,
): Promise<string | null> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("country.getCountryById", { countryId }),
  );
  return parseCountryCapitalRegionId(unwrapTrpcData(json));
}
