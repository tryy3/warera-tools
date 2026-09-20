import type { BattleSide, OrderPriority } from "../battle-bonus/types";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type ParsedBattleOrder = {
  ownerType: "mu" | "country";
  ownerId: string;
  side: BattleSide;
  priority: OrderPriority;
  payload: Record<string, unknown> | null;
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

function resolveOwner(obj: Record<string, unknown>): { ownerType: "mu" | "country"; ownerId: string } | null {
  const muId = pickString(obj, ["mu", "muId"]);
  if (muId) return { ownerType: "mu", ownerId: muId };
  const countryId = pickString(obj, ["country", "countryId"]);
  if (countryId) return { ownerType: "country", ownerId: countryId };
  return null;
}

function parsePriority(raw: unknown): OrderPriority | null {
  if (raw === "low" || raw === 1) return "low";
  if (raw === "medium" || raw === 2) return "medium";
  if (raw === "high" || raw === 3) return "high";
  return null;
}

function parseSide(raw: unknown): BattleSide | null {
  return raw === "attacker" || raw === "defender" ? raw : null;
}

function extractOrderList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asRecord(raw);
  if (!obj) return [];
  for (const key of ["orders", "items", "battleOrders"] as const) {
    const list = obj[key];
    if (Array.isArray(list)) return list;
  }
  return [];
}

function parseOne(raw: unknown): ParsedBattleOrder | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const owner = resolveOwner(obj);
  const side = parseSide(obj.side);
  const priority = parsePriority(obj.priority);
  if (!owner || !side || !priority) return null;
  return {
    ...owner,
    side,
    priority,
    payload: null,
  };
}

export function parseBattleOrders(raw: unknown): ParsedBattleOrder[] {
  return extractOrderList(raw).flatMap((row) => {
    const parsed = parseOne(row);
    return parsed ? [parsed] : [];
  });
}

export async function fetchBattleOrders(
  warera: WareraRequester,
  battleId: string,
): Promise<ParsedBattleOrder[]> {
  const json = await warera.request<unknown>(
    wareraProcedurePath("battleOrder.getByBattle", { battleId }),
  );
  return parseBattleOrders(unwrapTrpcData(json));
}
