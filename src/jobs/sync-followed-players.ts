import type { Db } from "../db/client";
import { listDistinctFollowedPlayerIds, reconcileFollowPlayerMu } from "../db/watch-reasons";
import { upsertPlayerCurrent } from "../db/players";
import { fetchUserByIdBatch } from "../warera/users";
import type { WareraRequester } from "../warera/prices";

/**
 * Sync every followed player's current profile and reconcile the MU
 * `follow_player` watch reasons to match each player's current MU.
 *
 * Distinct followed player ids are read from `player_watch_reasons`, batch
 * fetched via `user.getUserById`, and for each ok hit the `players` row is
 * upserted and that player's `follow_player` MU reason is moved to their
 * current MU. Failed / null hits push an error string and skip reconcile so
 * the previous current row and follow reasons are left untouched.
 *
 * Requires `warera.requestBatch` (the production client always provides it).
 * Never calls `search.*`.
 */
export async function syncFollowedPlayers(options: {
  db: Db;
  warera: WareraRequester;
  now?: Date;
}): Promise<{ playerCount: number; errors: string[] }> {
  const { db, warera } = options;
  const now = options.now ?? new Date();

  const ids = await listDistinctFollowedPlayerIds(db);
  if (ids.length === 0) {
    return { playerCount: 0, errors: [] };
  }

  if (!warera.requestBatch) {
    throw new Error("syncFollowedPlayers requires warera.requestBatch");
  }

  const userById = await fetchUserByIdBatch(warera, ids);
  const errors: string[] = [];
  let playerCount = 0;

  for (const playerId of ids) {
    const ref = userById.get(playerId);
    if (!ref) {
      errors.push(`player ${playerId}: lookup failed`);
      continue;
    }
    await db.transaction(async (tx) => {
      await upsertPlayerCurrent(tx, {
        id: ref.userId,
        username: ref.username,
        muId: ref.muId,
        workplaceCompanyId: ref.companyId,
        payload: null,
        fetchedAt: now,
      });
      await reconcileFollowPlayerMu(tx, {
        playerId: ref.userId,
        muId: ref.muId,
        at: now,
      });
    });
    playerCount += 1;
  }

  return { playerCount, errors };
}
