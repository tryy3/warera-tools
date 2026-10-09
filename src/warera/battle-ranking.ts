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

export type RankingTarget = { scope: RankingScope; side: BattleSideId };
export type DamageRanking = { rows: ParsedRankingRow[]; complete: boolean };

export const RANKING_MAX_PAGES = 5;

const PROCEDURE = "battleRanking.getRanking";

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

function rankingInput(target: RankingTarget, cursor: string | undefined): Record<string, unknown> {
  const { scope, side } = target;
  return {
    ...(scope.kind === "round" ? { roundId: scope.roundId } : { battleId: scope.battleId }),
    dataType: "damage",
    type: "user",
    side,
    limit: 100,
    ...(cursor ? { cursor } : {}),
  };
}

async function fetchPages(
  warera: WareraRequester,
  inputs: Record<string, unknown>[],
): Promise<RankingPage[]> {
  if (!warera.requestBatch) {
    return Promise.all(
      inputs.map(async (input) =>
        parseRankingPage(
          unwrapTrpcData(await warera.request<unknown>(wareraProcedurePath(PROCEDURE, input))),
        ),
      ),
    );
  }
  const slots = await warera.requestBatch(inputs.map((input) => ({ procedure: PROCEDURE, input })));
  return inputs.map((_, i) => {
    const slot = slots[i];
    if (!slot?.ok) throw new Error(`${PROCEDURE} batch slot ${i} failed`);
    return parseRankingPage(slot.data);
  });
}

/**
 * Walks every target's ranking, one HTTP batch per page depth instead of one call per page.
 * `complete: false` means the page cap was hit, so ranks below the last row are unknown.
 */
export async function fetchDamageRankings(
  warera: WareraRequester,
  targets: readonly RankingTarget[],
  maxPages = RANKING_MAX_PAGES,
): Promise<DamageRanking[]> {
  const results: DamageRanking[] = targets.map(() => ({ rows: [], complete: true }));
  let pending = targets.map((_, i) => ({ index: i, cursor: undefined as string | undefined }));

  for (let depth = 0; depth < maxPages && pending.length > 0; depth++) {
    const pages = await fetchPages(
      warera,
      pending.map((p) => rankingInput(targets[p.index]!, p.cursor)),
    );
    const next: typeof pending = [];
    pages.forEach((page, i) => {
      const { index } = pending[i]!;
      results[index]!.rows.push(...page.rows);
      if (page.nextCursor) next.push({ index, cursor: page.nextCursor });
    });
    pending = next;
  }
  for (const p of pending) results[p.index]!.complete = false;
  return results;
}
