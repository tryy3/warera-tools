import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type ParsedRegionCombat = {
  bunkerLevel: number | null;
  bunkerActive: boolean | null;
  militaryBaseLevel: number | null;
  militaryBaseActive: boolean | null;
  resistance: number | null;
  neighborRegionIds: string[];
  ownerCountryId: string | null;
  isCore: boolean;
};

export type RegionGraphNode = {
  regionId: string;
  ownerCountryId: string | null;
  neighborRegionIds: string[] | null;
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

function pickInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

function pickBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function pickFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function parseFacility(raw: unknown): { level: number | null; active: boolean | null } {
  const obj = asRecord(raw);
  if (!obj) {
    if (typeof raw === "number") return { level: Math.trunc(raw), active: raw > 0 };
    return { level: null, active: null };
  }
  return {
    level: pickInt(obj.level ?? obj.upgradeLevel),
    active: pickBool(obj.active ?? obj.isActive),
  };
}

function neighborIdFromEntry(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  const rec = asRecord(value);
  if (!rec) return null;
  return pickString(rec, ["_id", "id", "regionId"]);
}

function parseNeighbors(obj: Record<string, unknown>): string[] {
  for (const key of ["neighbors", "borderingRegions", "borderRegions", "adjacentRegions"]) {
    const raw = obj[key];
    const list = pickStringList(raw);
    if (list.length > 0) return list;
    if (!Array.isArray(raw)) continue;
    const ids: string[] = [];
    for (const entry of raw) {
      const id = neighborIdFromEntry(entry);
      if (id) ids.push(id);
    }
    if (ids.length > 0) return ids;
  }
  return [];
}

export function parseRegionCombat(raw: unknown): ParsedRegionCombat {
  const obj = asRecord(raw) ?? {};
  const bunker = parseFacility(obj.bunker);
  const militaryBase = parseFacility(obj.militaryBase ?? obj.military_base);
  const ownerCountryId = pickString(obj, ["countryId", "country", "ownerCountryId", "owner"]);
  const isCore = obj.isCore === true || obj.core === true;
  return {
    bunkerLevel: bunker.level,
    bunkerActive: bunker.active,
    militaryBaseLevel: militaryBase.level,
    militaryBaseActive: militaryBase.active,
    resistance: pickFiniteNumber(obj.resistance),
    neighborRegionIds: parseNeighbors(obj),
    ownerCountryId,
    isCore,
  };
}

export function isBattleRevoltType(type: string | null): boolean {
  if (!type) return false;
  const lower = type.toLowerCase();
  return lower.includes("revolt") || lower.includes("resistance");
}

export function computeDefenderSupplyLinked(
  startRegionId: string,
  capitalRegionId: string | null,
  regionById: Map<string, RegionGraphNode>,
): boolean | null {
  if (!capitalRegionId) return null;
  const start = regionById.get(startRegionId);
  if (!start) return null;
  const defenderOwner = start.ownerCountryId;
  if (!defenderOwner) return null;

  if (startRegionId === capitalRegionId) return true;

  const visited = new Set<string>([startRegionId]);
  const queue = [startRegionId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = regionById.get(currentId);
    if (!node) return null;
    if (node.neighborRegionIds === null) return null;
    for (const neighborId of node.neighborRegionIds) {
      if (visited.has(neighborId)) continue;
      const neighbor = regionById.get(neighborId);
      if (!neighbor) return null;
      if (neighbor.ownerCountryId !== defenderOwner) continue;
      if (neighborId === capitalRegionId) return true;
      visited.add(neighborId);
      queue.push(neighborId);
    }
  }
  return false;
}

export const DEFENDER_SUPPLY_BFS_FETCH_CAP = 50;

export type RegionCombatLoader = (regionId: string) => Promise<ParsedRegionCombat | null>;

/** BFS same-owner regions, fetching missing neighbors up to {@link DEFENDER_SUPPLY_BFS_FETCH_CAP}. */
export async function computeDefenderSupplyLinkedWithFetch(
  startRegionId: string,
  capitalRegionId: string | null,
  seedGraph: Map<string, RegionGraphNode>,
  loadRegionCombat: RegionCombatLoader,
  fetchCap = DEFENDER_SUPPLY_BFS_FETCH_CAP,
): Promise<boolean | null> {
  if (!capitalRegionId) return null;
  const graph = new Map(seedGraph);
  const start = graph.get(startRegionId);
  if (!start) return null;
  const defenderOwner = start.ownerCountryId;
  if (!defenderOwner) return null;
  if (startRegionId === capitalRegionId) return true;

  let fetchCount = 0;
  const visited = new Set<string>([startRegionId]);
  const queue = [startRegionId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = graph.get(currentId);
    if (!node) return null;
    if (node.neighborRegionIds === null) return null;

    for (const neighborId of node.neighborRegionIds) {
      if (visited.has(neighborId)) continue;

      let neighbor = graph.get(neighborId);
      if (!neighbor) {
        if (fetchCount >= fetchCap) return null;
        fetchCount++;
        const combat = await loadRegionCombat(neighborId);
        if (!combat) return null;
        neighbor = toGraphNode(neighborId, combat);
        graph.set(neighborId, neighbor);
      }

      if (neighbor.ownerCountryId !== defenderOwner) continue;
      if (neighborId === capitalRegionId) return true;
      visited.add(neighborId);
      queue.push(neighborId);
    }
  }
  return false;
}

export function toGraphNode(regionId: string, combat: ParsedRegionCombat): RegionGraphNode {
  return {
    regionId,
    ownerCountryId: combat.ownerCountryId,
    neighborRegionIds: combat.neighborRegionIds,
  };
}

export async function fetchRegionCombat(
  warera: WareraRequester,
  regionId: string,
): Promise<ParsedRegionCombat> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("region.getById", { regionId }),
  );
  return parseRegionCombat(unwrapTrpcData(json));
}
