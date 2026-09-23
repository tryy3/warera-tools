import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type DiplomacyPact = { countryId: string; since: string | null };

export type ParsedCountryDiplomacy = {
  allianceId: string | null;
  swornEnemyId: string | null;
  swornEnemySince: Date | null;
  pacts: DiplomacyPact[];
};

export type ParsedCountryRecord = {
  capitalRegionId: string | null;
  allianceId: string | null;
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

function pickId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  const rec = asRecord(value);
  if (!rec) return null;
  return pickString(rec, ["_id", "id", "allianceId", "countryId", "country_id", "partner"]);
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

function parsePacts(raw: unknown): DiplomacyPact[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw)?.pacts)
      ? (asRecord(raw)!.pacts as unknown[])
      : Array.isArray(asRecord(raw)?.defensivePacts)
        ? (asRecord(raw)!.defensivePacts as unknown[])
        : [];
  const out: DiplomacyPact[] = [];
  for (const row of list) {
    if (typeof row === "string" && row.length > 0) {
      out.push({ countryId: row, since: null });
      continue;
    }
    const obj = asRecord(row);
    if (!obj) continue;
    const countryId = pickId(
      obj.countryId ?? obj.country ?? obj.country_id ?? obj.partner ?? obj.partnerId,
    );
    if (!countryId) continue;
    const sinceRaw = obj.since;
    const since =
      typeof sinceRaw === "string" && sinceRaw.length > 0
        ? sinceRaw
        : (pickDate(sinceRaw)?.toISOString() ?? null);
    out.push({ countryId, since });
  }
  return out;
}

function parseSwornEnemy(raw: unknown): { id: string | null; since: Date | null } {
  const obj = asRecord(raw);
  if (!obj) return { id: null, since: null };
  const id = pickString(obj, ["countryId", "country", "country_id", "enemy", "_id", "id"]);
  return { id, since: pickDate(obj.since) };
}

export function parseCountryDiplomacy(raw: unknown): ParsedCountryDiplomacy {
  const obj = asRecord(raw) ?? {};
  const sworn = parseSwornEnemy(obj.swornEnemy ?? obj.sworn_enemy);
  const allianceId = pickId(obj.allianceId ?? obj.alliance ?? obj.alliance_id);
  const pacts = parsePacts(obj.defensivePacts ?? obj.defensive_pacts ?? obj.pacts);
  return {
    allianceId,
    swornEnemyId: sworn.id,
    swornEnemySince: sworn.since,
    pacts,
  };
}

export function parseCountryRecord(raw: unknown): ParsedCountryRecord {
  const obj = asRecord(raw);
  if (!obj) return { capitalRegionId: null, allianceId: null };
  return {
    capitalRegionId: pickString(obj, [
      "capitalRegionId",
      "capitalRegion",
      "capital",
      "capital_region_id",
    ]),
    allianceId: pickId(obj.allianceId ?? obj.alliance ?? obj.alliance_id),
  };
}

export function parseCountryCapitalRegionId(raw: unknown): string | null {
  return parseCountryRecord(raw).capitalRegionId;
}

function mergeAllianceDevelopments(target: Map<string, number>, source: Map<string, number>): void {
  for (const [id, dev] of source) {
    if (!target.has(id)) target.set(id, dev);
  }
}

export function parseAllianceDevelopments(raw: unknown): Map<string, number> {
  const obj = asRecord(raw);
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(obj?.items)
      ? obj.items
      : Array.isArray(obj?.alliances)
        ? obj.alliances
        : [];
  const allianceDevelopmentById = new Map<string, number>();
  for (const row of rows) {
    const a = asRecord(row);
    if (!a) continue;
    const id = pickString(a, ["_id", "id", "allianceId", "alliance"]);
    const dev =
      pickFiniteNumber(a.coreDevelopment) ??
      pickFiniteNumber(a.currentDevelopment) ??
      pickFiniteNumber(a.development) ??
      pickFiniteNumber(a.totalDevelopment) ??
      pickFiniteNumber(a.value);
    if (id && dev != null) allianceDevelopmentById.set(id, dev);
  }
  return allianceDevelopmentById;
}

export function parseWorldDevelopment(raw: unknown): ParsedWorldDevelopment {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { totalDevelopment: raw, allianceDevelopmentById: new Map() };
  }
  const obj = asRecord(raw) ?? {};
  const totalDevelopment =
    pickFiniteNumber(obj.totalDevelopment) ??
    pickFiniteNumber(obj.total) ??
    pickFiniteNumber(obj.worldDevelopment);
  const allianceDevelopmentById = parseAllianceDevelopments(raw);
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
  const parsed = parseCountryDiplomacy(unwrapTrpcData(json));
  if (parsed.allianceId != null && parsed.pacts.length > 0) return parsed;

  const countryJson = await warera.request<unknown>(
    wareraProcedurePath("country.getCountryById", { countryId }),
  );
  const country = parseCountryRecord(unwrapTrpcData(countryJson));
  const countryPacts = parsePacts(asRecord(unwrapTrpcData(countryJson))?.defensivePacts);
  return {
    ...parsed,
    allianceId: parsed.allianceId ?? country.allianceId,
    pacts: parsed.pacts.length > 0 ? parsed.pacts : countryPacts,
  };
}

export async function fetchWorldDevelopment(
  warera: WareraRequester,
): Promise<ParsedWorldDevelopment> {
  const json = await warera.request<unknown>(wareraProcedurePath("gameStat.getWorldDevelopment"));
  const parsed = parseWorldDevelopment(unwrapTrpcData(json));
  if (parsed.allianceDevelopmentById.size > 0) return parsed;

  const alliancesJson = await warera.request<unknown>(
    wareraProcedurePath("alliance.getManyPaginated", { page: 1, limit: 50 }),
  );
  mergeAllianceDevelopments(
    parsed.allianceDevelopmentById,
    parseAllianceDevelopments(unwrapTrpcData(alliancesJson)),
  );
  return parsed;
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
