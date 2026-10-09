import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type BattleSideId = "attacker" | "defender";

/** `roundId` ranks carry round prizes, `battleId` ranks carry battle prizes. */
export type RankingScope =
  | { kind: "round"; roundId: string }
  | { kind: "battle"; battleId: string };

export type ParsedRankingRow = {
  rank: number;
  userId: string;
  value: number;
  /** Equipment code of the pre-rolled prize bound to this rank slot, when it has one. */
  lootItemCode: string | null;
};

export type RankingPage = {
  rows: ParsedRankingRow[];
  nextCursor: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseRankingPage(data: unknown): RankingPage {
  const obj = asRecord(data);
  if (!obj || !Array.isArray(obj.items)) {
    throw new Error("battleRanking.getRanking returned an unexpected payload");
  }
  const rows: ParsedRankingRow[] = [];
  for (const raw of obj.items) {
    const row = asRecord(raw);
    if (!row) continue;
    const { rank, user, value } = row;
    if (typeof rank !== "number" || !Number.isFinite(rank)) continue;
    if (typeof user !== "string" || user.length === 0) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const loot = asRecord(row.lootItem);
    rows.push({
      rank,
      userId: user,
      value,
      lootItemCode: typeof loot?.code === "string" && loot.code ? loot.code : null,
    });
  }
  const nextCursor = typeof obj.nextCursor === "string" && obj.nextCursor ? obj.nextCursor : null;
  return { rows, nextCursor };
}

export async function fetchDamageRankingPage(
  warera: WareraRequester,
  scope: RankingScope,
  side: BattleSideId,
  cursor?: string,
): Promise<RankingPage> {
  const input: Record<string, unknown> = {
    ...(scope.kind === "round" ? { roundId: scope.roundId } : { battleId: scope.battleId }),
    dataType: "damage",
    type: "user",
    side,
    limit: 100,
  };
  if (cursor) input.cursor = cursor;
  const json = await warera.request<unknown>(
    wareraProcedurePath("battleRanking.getRanking", input),
  );
  return parseRankingPage(unwrapTrpcData(json));
}

export const RANKING_MAX_PAGES = 5;

/** Walks pages until the cursor ends or `maxPages` is hit. `complete: false` means ranks below the last row are unknown. */
export async function fetchDamageRanking(
  warera: WareraRequester,
  scope: RankingScope,
  side: BattleSideId,
  maxPages = RANKING_MAX_PAGES,
): Promise<{ rows: ParsedRankingRow[]; complete: boolean }> {
  const rows: ParsedRankingRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchDamageRankingPage(warera, scope, side, cursor);
    rows.push(...result.rows);
    if (!result.nextCursor) return { rows, complete: true };
    cursor = result.nextCursor;
  }
  return { rows, complete: false };
}
