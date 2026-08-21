import { and, asc, eq } from "drizzle-orm";
import type { Db, DbOrTx } from "./client";
import { muWatchReasons, playerWatchReasons } from "./schema";

export const WATCH_REASON_MANUAL = "manual";
export const WATCH_REASON_FOLLOW_PLAYER = "follow_player";
/** Sentinel for reasons with no source player (PK column is NOT NULL). */
export const MANUAL_SOURCE_ID = "";

export type WatchReason = typeof WATCH_REASON_MANUAL | typeof WATCH_REASON_FOLLOW_PLAYER;

export async function insertPlayerWatchReason(
  db: DbOrTx,
  row: { playerId: string; reason: string; sourceId: string; at: Date },
): Promise<void> {
  await db
    .insert(playerWatchReasons)
    .values({
      playerId: row.playerId,
      reason: row.reason,
      sourceId: row.sourceId,
      lastTouchedAt: row.at,
      createdAt: row.at,
    })
    .onConflictDoNothing();
}

export async function deletePlayerWatchReason(
  db: Db,
  row: { playerId: string; reason: string; sourceId: string },
): Promise<void> {
  await db
    .delete(playerWatchReasons)
    .where(
      and(
        eq(playerWatchReasons.playerId, row.playerId),
        eq(playerWatchReasons.reason, row.reason),
        eq(playerWatchReasons.sourceId, row.sourceId),
      ),
    );
}

export async function listDistinctFollowedPlayerIds(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ playerId: playerWatchReasons.playerId })
    .from(playerWatchReasons)
    .orderBy(asc(playerWatchReasons.playerId));
  return rows.map((r) => r.playerId);
}

export async function insertMuWatchReason(
  db: DbOrTx,
  row: { muId: string; reason: string; sourceId: string; at: Date },
): Promise<void> {
  await db
    .insert(muWatchReasons)
    .values({
      muId: row.muId,
      reason: row.reason,
      sourceId: row.sourceId,
      lastTouchedAt: row.at,
      createdAt: row.at,
    })
    .onConflictDoNothing();
}

export async function deleteMuWatchReason(
  db: Db,
  row: { muId: string; reason: string; sourceId: string },
): Promise<void> {
  await db
    .delete(muWatchReasons)
    .where(
      and(
        eq(muWatchReasons.muId, row.muId),
        eq(muWatchReasons.reason, row.reason),
        eq(muWatchReasons.sourceId, row.sourceId),
      ),
    );
}

export async function listDistinctWatchedMuIds(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ muId: muWatchReasons.muId })
    .from(muWatchReasons)
    .orderBy(asc(muWatchReasons.muId));
  return rows.map((r) => r.muId);
}

export async function listMuWatchReasons(
  db: Db,
  muId: string,
): Promise<{ reason: string; sourceId: string }[]> {
  const rows = await db
    .select({ reason: muWatchReasons.reason, sourceId: muWatchReasons.sourceId })
    .from(muWatchReasons)
    .where(eq(muWatchReasons.muId, muId));
  return rows.map((r) => ({ reason: r.reason, sourceId: r.sourceId }));
}

/**
 * Move this player's `follow_player` MU reason to `muId` (or clear it).
 * Runs on the caller’s connection/`tx` — do not nest another transaction here.
 */
export async function reconcileFollowPlayerMu(
  db: DbOrTx,
  input: { playerId: string; muId: string | null; at: Date },
): Promise<void> {
  await db
    .delete(muWatchReasons)
    .where(
      and(
        eq(muWatchReasons.reason, WATCH_REASON_FOLLOW_PLAYER),
        eq(muWatchReasons.sourceId, input.playerId),
      ),
    );
  if (input.muId === null) return;
  await db
    .insert(muWatchReasons)
    .values({
      muId: input.muId,
      reason: WATCH_REASON_FOLLOW_PLAYER,
      sourceId: input.playerId,
      lastTouchedAt: input.at,
      createdAt: input.at,
    })
    .onConflictDoNothing();
}

export async function deleteFollowPlayerReasonsForSource(
  db: DbOrTx,
  playerId: string,
): Promise<void> {
  await db
    .delete(muWatchReasons)
    .where(
      and(
        eq(muWatchReasons.reason, WATCH_REASON_FOLLOW_PLAYER),
        eq(muWatchReasons.sourceId, playerId),
      ),
    );
}
