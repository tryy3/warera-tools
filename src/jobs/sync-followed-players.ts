import type { Db } from "../db/client";
import { USER_PROFILE_JOB_MAX_AGE_MS } from "../db/user-profiles";
import { listDistinctFollowedPlayerIds, reconcileFollowPlayerMu } from "../db/watch-reasons";
import { upsertPlayerCurrent } from "../db/players";
import { resolveUserByIdRef } from "../user/resolve-user-by-id";
import type { WareraRequester } from "../warera/prices";

/**
 * Sync every followed player's current profile and reconcile the MU
 * `follow_player` watch reasons to match each player's current MU.
 *
 * Distinct followed player ids are read from `player_watch_reasons` and
 * resolved from a fresh profile snapshot before falling back to
 * `user.getUserById`. Each hit upserts the `players` row and moves that
 * player's `follow_player` MU reason to their current MU. Failed lookups push
 * an error string and leave the previous current row and reasons untouched.
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

  const errors: string[] = [];
  let playerCount = 0;

  for (const playerId of ids) {
    try {
      const ref = await resolveUserByIdRef({
        db,
        warera,
        userId: playerId,
        maxAgeMs: USER_PROFILE_JOB_MAX_AGE_MS,
        now,
      });
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
    } catch {
      errors.push(`player ${playerId}: lookup failed`);
    }
  }

  return { playerCount, errors };
}
