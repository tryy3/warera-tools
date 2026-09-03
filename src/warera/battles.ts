import { isWareraNotFoundError } from "./errors";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export const BATTLE_END_SETTLE_MS = 60_000;

export type ParsedBattleSide = {
  countryId: string | null;
  regionId: string | null;
  wonRoundsCount: number | null;
  muOrders: string[];
  hitCount: number | null;
};

export type ParsedCurrentRoundLive = {
  ticksCount: number | null;
  nextTickAt: Date | null;
};

export type ParsedCurrentRound = {
  id: string | null;
  number: number | null;
  isActive: boolean | null;
  attackerDamages: number | null;
  defenderDamages: number | null;
  attackerPoints: number | null;
  defenderPoints: number | null;
  live: ParsedCurrentRoundLive | null;
  createdAt: Date | null;
};

export type ParsedBattle = {
  id: string;
  warId: string | null;
  type: string | null;
  isActive: boolean;
  attacker: ParsedBattleSide;
  defender: ParsedBattleSide;
  roundsToWin: number | null;
  rounds: string[];
  roundsHistory: unknown[];
  startedAtGame: Date | null;
  currentRound: ParsedCurrentRound | null;
  payload: Record<string, unknown> | null;
};

export type BattleScoreboardFields = {
  roundId: string | null;
  roundNumber: number | null;
  roundIsActive: boolean | null;
  attackerPoints: number | null;
  defenderPoints: number | null;
  attackerDamages: number | null;
  defenderDamages: number | null;
  attackerHitCount: number | null;
  defenderHitCount: number | null;
  ticksCount: number | null;
  nextTickAt: Date | null;
  roundStartedAtGame: Date | null;
};

export type ParsedBattleLootSummary = {
  totalDmg: number | null;
  hits: number | null;
  totalMoneyFromBounty: number | null;
  totalMoneyFromContract: number | null;
  case1Count: number | null;
  case2Count: number | null;
  poolLoot: unknown[] | null;
  payload: Record<string, unknown> | null;
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

function pickFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickInt(value: unknown): number | null {
  const n = pickFiniteNumber(value);
  return n == null ? null : Math.trunc(n);
}

function pickDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function pickStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function parseSide(raw: unknown): ParsedBattleSide {
  const obj = asRecord(raw) ?? {};
  return {
    countryId: pickString(obj, ["country", "countryId"]),
    regionId: pickString(obj, ["region", "regionId"]),
    wonRoundsCount: pickInt(obj.wonRoundsCount),
    muOrders: pickStringList(obj.muOrders),
    hitCount: pickInt(obj.hitCount),
  };
}

function parseCurrentRoundObject(obj: Record<string, unknown>): ParsedCurrentRound {
  const attacker = asRecord(obj.attacker) ?? {};
  const defender = asRecord(obj.defender) ?? {};
  const liveObj = asRecord(obj.live);
  return {
    id: pickString(obj, ["_id", "id"]),
    number: pickInt(obj.number),
    isActive: typeof obj.isActive === "boolean" ? obj.isActive : null,
    attackerDamages: pickFiniteNumber(attacker.damages),
    defenderDamages: pickFiniteNumber(defender.damages),
    attackerPoints: pickFiniteNumber(attacker.points),
    defenderPoints: pickFiniteNumber(defender.points),
    live: liveObj
      ? {
          ticksCount: pickInt(liveObj.ticksCount),
          nextTickAt: pickDate(liveObj.nextTickAt),
        }
      : null,
    createdAt: pickDate(obj.createdAt),
  };
}

function parseEmbeddedCurrentRound(raw: unknown): ParsedCurrentRound | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  return parseCurrentRoundObject(obj);
}

const KNOWN_BATTLE_KEYS = new Set([
  "_id",
  "id",
  "war",
  "warId",
  "type",
  "isActive",
  "roundsToWin",
  "rounds",
  "roundsHistory",
  "createdAt",
  "updatedAt",
  "attacker",
  "defender",
  "currentRound",
  "__v",
]);

const KNOWN_LOOT_KEYS = new Set([
  "totalDmg",
  "hits",
  "totalMoneyFromBounty",
  "totalMoneyFromContract",
  "case1Count",
  "case2Count",
  "poolLoot",
  "_id",
  "id",
  "battle",
  "battleId",
  "user",
  "userId",
  "createdAt",
  "updatedAt",
  "__v",
]);

function leftovers(
  obj: Record<string, unknown>,
  known: Set<string>,
): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.has(k)) payload[k] = v;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}

function parseBattle(raw: unknown): ParsedBattle | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, ["_id", "id", "battleId"]);
  if (!id) return null;
  return {
    id,
    warId: pickString(obj, ["war", "warId"]),
    type: pickString(obj, ["type"]),
    isActive: obj.isActive === true,
    attacker: parseSide(obj.attacker),
    defender: parseSide(obj.defender),
    roundsToWin: pickInt(obj.roundsToWin),
    rounds: pickStringList(obj.rounds),
    roundsHistory: Array.isArray(obj.roundsHistory) ? obj.roundsHistory : [],
    startedAtGame: pickDate(obj.createdAt),
    currentRound: parseEmbeddedCurrentRound(obj.currentRound),
    payload: leftovers(obj, KNOWN_BATTLE_KEYS),
  };
}

export function parseBattleListItem(raw: unknown): ParsedBattle | null {
  return parseBattle(raw);
}

export function parseBattleById(raw: unknown): ParsedBattle {
  const parsed = parseBattle(raw);
  if (!parsed) throw new Error("battle.getById missing id");
  return parsed;
}

export function parseBattleLootSummary(raw: unknown): ParsedBattleLootSummary {
  const obj = asRecord(raw) ?? {};
  return {
    totalDmg: pickFiniteNumber(obj.totalDmg),
    hits: pickInt(obj.hits),
    totalMoneyFromBounty: pickFiniteNumber(obj.totalMoneyFromBounty),
    totalMoneyFromContract: pickFiniteNumber(obj.totalMoneyFromContract),
    case1Count: pickInt(obj.case1Count),
    case2Count: pickInt(obj.case2Count),
    poolLoot: Array.isArray(obj.poolLoot) ? obj.poolLoot : null,
    payload: leftovers(obj, KNOWN_LOOT_KEYS),
  };
}

export function scoreboardFromBattle(battle: ParsedBattle): BattleScoreboardFields | null {
  const round = battle.currentRound;
  if (!round) return null;
  return {
    roundId: round.id,
    roundNumber: round.number,
    roundIsActive: round.isActive,
    attackerPoints: round.attackerPoints,
    defenderPoints: round.defenderPoints,
    attackerDamages: round.attackerDamages,
    defenderDamages: round.defenderDamages,
    attackerHitCount: battle.attacker.hitCount,
    defenderHitCount: battle.defender.hitCount,
    ticksCount: round.live?.ticksCount ?? null,
    nextTickAt: round.live?.nextTickAt ?? null,
    roundStartedAtGame: round.createdAt,
  };
}

export type ActiveBattlesPage = {
  items: ParsedBattle[];
  nextCursor: string | null;
  /**
   * True when the unwrapped payload was not a `{ items: unknown[] }` page
   * shape, or when an item that looked like a battle object failed to parse
   * to a battle with an id. Callers must treat a malformed page as an
   * incomplete walk (do NOT infer "no more battles" from it).
   */
  malformed: boolean;
};

export async function fetchActiveBattlesPage(
  warera: WareraRequester,
  opts: { limit?: number; cursor?: string } = {},
): Promise<ActiveBattlesPage> {
  const input: Record<string, unknown> = { isActive: true, limit: opts.limit ?? 50 };
  if (opts.cursor) input.cursor = opts.cursor;
  const json = await warera.request<unknown>(wareraProcedurePath("battle.getBattles", input));
  const data = unwrapTrpcData(json);
  const obj = asRecord(data);
  if (!obj || !Array.isArray(obj.items)) {
    // Payload present but not a `{ items: unknown[] }` page shape.
    return { items: [], nextCursor: null, malformed: true };
  }
  const items: ParsedBattle[] = [];
  let malformed = false;
  for (const raw of obj.items) {
    const parsed = parseBattleListItem(raw);
    if (parsed) {
      items.push(parsed);
      continue;
    }
    // Item failed to parse. If it looked like a battle object (had fields but
    // no usable id), the page is malformed — do not silently drop it.
    if (asRecord(raw)) malformed = true;
  }
  const nextCursor =
    (typeof obj.nextCursor === "string" && obj.nextCursor) ||
    (typeof obj.cursor === "string" && obj.cursor) ||
    null;
  return { items, nextCursor, malformed };
}

export async function fetchAllActiveBattles(warera: WareraRequester): Promise<{
  battles: ParsedBattle[];
  pages: number;
  complete: boolean;
}> {
  const battles: ParsedBattle[] = [];
  let cursor: string | undefined;
  let pages = 0;
  try {
    for (;;) {
      const page = await fetchActiveBattlesPage(warera, { cursor, limit: 50 });
      pages += 1;
      battles.push(...page.items);
      // A malformed page means we cannot trust the walk to be complete —
      // keep whatever valid items we parsed, but signal incompleteness.
      if (page.malformed) {
        return { battles, pages, complete: false };
      }
      if (!page.nextCursor) return { battles, pages, complete: true };
      cursor = page.nextCursor;
    }
  } catch {
    return { battles, pages, complete: false };
  }
}

export async function fetchBattleById(
  warera: WareraRequester,
  battleId: string,
): Promise<ParsedBattle> {
  const json = await warera.request<unknown>(wareraProcedurePath("battle.getById", { battleId }));
  return parseBattleById(unwrapTrpcData(json));
}

export async function fetchBattleLootSummary(
  warera: WareraRequester,
  battleId: string,
  userId: string,
): Promise<ParsedBattleLootSummary | null> {
  try {
    const json = await warera.request<unknown>(
      wareraProcedurePath("battleLootSummary.getByBattleAndUser", { battleId, userId }),
    );
    return parseBattleLootSummary(unwrapTrpcData(json));
  } catch (err) {
    if (isWareraNotFoundError(err)) return null;
    throw err;
  }
}
