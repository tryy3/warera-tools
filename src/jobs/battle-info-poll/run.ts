import type { Db } from "../../db/client";
import {
  listActiveTrackedBattles,
  markBattleEnded,
  markBattleFinalized,
  upsertBattleFromParsed,
} from "../../db/battles";
import {
  insertBattleLootSnapshots,
  insertBattlePoll,
  insertBattleScoreboardSnapshots,
  type BattleLootSnapshotRow,
  type BattleScoreboardSnapshotRow,
} from "../../db/battle-stats";
import { listMuMembers, listMusForSync } from "../../db/mus";
import type { Logger } from "../../logging/logger";
import {
  BATTLE_END_SETTLE_MS,
  fetchAllActiveBattles,
  fetchBattleById,
  fetchBattleLootSummary,
  scoreboardFromBattle,
  type ParsedBattle,
  type ParsedBattleLootSummary,
} from "../../warera/battles";
import type { WareraRequester } from "../../warera/prices";

export type BattleInfoPollResult = {
  pollId: number;
  battleCount: number;
  lootSnapshotCount: number;
  finalizedCount: number;
  status: "success" | "partial" | "error";
};

export async function runBattleInfoPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  now?: Date;
}): Promise<BattleInfoPollResult> {
  const { db, warera, logger } = options;
  const now = options.now ?? new Date();

  const errors: string[] = [];

  // Watchlist (Geo/User-tier reads; no live WarEra calls here).
  const watchedMuIds = await listMusForSync(db);
  const watchedSet = new Set(watchedMuIds);

  // Drain the full active-battle cursor before any end-detection.
  const { battles: activeList, pages, complete } = await fetchAllActiveBattles(warera);
  if (!complete) {
    errors.push("active battle pagination incomplete");
  }
  const activeById = new Map<string, ParsedBattle>(activeList.map((b) => [b.id, b]));

  // Phase 1 — discover newly/still-relevant battles from the active list.
  // A battle is relevant when at least one of its MU orders intersects the
  // watchlist. Sticky battles already in DB are handled in phase 2 even when
  // their current orders no longer intersect (sticky ids are preserved there).
  for (const b of activeList) {
    const orderMus = [...b.attacker.muOrders, ...b.defender.muOrders];
    const hit = orderMus.filter((id) => watchedSet.has(id));
    if (hit.length === 0) continue;
    await upsertBattleFromParsed(db, b, { stickyMuIds: hit, fetchedAt: now });
  }

  // Phase 2 — process every tracked active battle.
  const dbActive = await listActiveTrackedBattles(db);

  // Rosters: load members for every watched MU AND every sticky MU id across
  // active tracked battles. Unwatched-but-sticky MUs still need their
  // `mu_members` rows so their members get loot in phase 2.
  const rosterMuIdSet = new Set(watchedMuIds);
  for (const row of dbActive) {
    for (const muId of row.stickyMuIds ?? []) rosterMuIdSet.add(muId);
  }
  const rosterByMu = new Map<string, string[]>();
  for (const muId of rosterMuIdSet) {
    const members = await listMuMembers(db, muId);
    rosterByMu.set(
      muId,
      members.map((m) => m.userId),
    );
  }

  const scoreboardRows: BattleScoreboardSnapshotRow[] = [];
  const lootRows: BattleLootSnapshotRow[] = [];
  // Battles that completed getById + final loot cleanly and are ready to be
  // finalized — but only AFTER poll + scoreboard + loot snapshots are durable.
  const finalizeCandidates: string[] = [];
  let finalizedCount = 0;

  for (const row of dbActive) {
    const parsed = activeById.get(row.id) ?? null;
    const stickyMuIds = row.stickyMuIds ?? [];

    if (parsed) {
      // Still in the complete active list: refresh identity/orders/round so the
      // row cannot go stale (including sticky battles whose current muOrders
      // no longer hit the watchlist), and clear any prior ended_at so a later
      // absence starts a fresh settle window instead of force-finalizing.
      await upsertBattleFromParsed(db, parsed, {
        stickyMuIds,
        fetchedAt: now,
        endedAt: null,
      });
      const sb = scoreboardFromBattle(parsed);
      if (sb) {
        scoreboardRows.push({
          battleId: row.id,
          roundId: sb.roundId,
          roundNumber: sb.roundNumber,
          roundIsActive: sb.roundIsActive,
          attackerPoints: sb.attackerPoints,
          defenderPoints: sb.defenderPoints,
          attackerDamages: sb.attackerDamages,
          defenderDamages: sb.defenderDamages,
          attackerHitCount: sb.attackerHitCount,
          defenderHitCount: sb.defenderHitCount,
          ticksCount: sb.ticksCount,
          nextTickAt: sb.nextTickAt,
          roundStartedAtGame: sb.roundStartedAtGame,
          recordedAt: now,
        });
      }
      await collectLoot(warera, row.id, stickyMuIds, rosterByMu, lootRows, now, errors, logger);
      continue;
    }

    // Absent from the upstream active set.
    if (!complete) {
      // Pagination incomplete — cannot trust the absence; do not mark ended.
      continue;
    }

    if (row.endedAt === null) {
      // First time we notice it ended — start the settle grace, still loot.
      await markBattleEnded(db, row.id, now);
      await collectLoot(warera, row.id, stickyMuIds, rosterByMu, lootRows, now, errors, logger);
      continue;
    }

    const ageMs = now.getTime() - row.endedAt.getTime();
    if (ageMs < BATTLE_END_SETTLE_MS) {
      // Within the 60s grace — loot only, no getById, not finalized.
      await collectLoot(warera, row.id, stickyMuIds, rosterByMu, lootRows, now, errors, logger);
      continue;
    }

    // Past grace — finalize with a single getById + final loot. Do NOT mark
    // finalized here: buffer the id and finalize only after poll + scoreboard
    // + loot snapshots are durable so a crash cannot drop the row from the
    // workset unfinalized with lost final snapshots. If any non-not-found
    // loot error occurs on the finalize path, leave the battle active for a
    // retry instead of finalizing.
    try {
      const fresh = await fetchBattleById(warera, row.id);
      // Keep is_active true through final metadata + loot so a crash cannot
      // drop the row from the workset unfinalized. markBattleFinalized (run
      // after snapshot inserts) is the only write that flips is_active false.
      await upsertBattleFromParsed(db, fresh, {
        stickyMuIds,
        fetchedAt: now,
      });
      const lootErrors = await collectLoot(
        warera,
        row.id,
        stickyMuIds,
        rosterByMu,
        lootRows,
        now,
        errors,
        logger,
      );
      if (lootErrors === 0) {
        finalizeCandidates.push(row.id);
      } else {
        logger.warn(
          { battleId: row.id, lootErrors },
          "battle finalize skipped due to finalize-path loot errors",
        );
      }
    } catch (err) {
      errors.push(`finalize ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn(
        { battleId: row.id, err: err instanceof Error ? err.message : String(err) },
        "battle finalize failed",
      );
    }
  }

  const battleCount = dbActive.length;

  // Status: error only when nothing usable was produced AND there were hard
  // failures (e.g. incomplete pagination with no work at all). Partial when
  // some work landed but errors remain. Success otherwise.
  const didWork =
    scoreboardRows.length > 0 ||
    lootRows.length > 0 ||
    finalizeCandidates.length > 0 ||
    battleCount > 0;
  let status: "success" | "partial" | "error";
  if (errors.length > 0 && !didWork) {
    status = "error";
  } else if (errors.length > 0) {
    status = "partial";
  } else {
    status = "success";
  }

  const pollId = await insertBattlePoll(db, {
    recordedAt: now,
    status,
    error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
    activeBattlePages: pages,
    battleCount,
    lootSnapshotCount: lootRows.length,
    finalizedCount: finalizeCandidates.length,
  });
  await insertBattleScoreboardSnapshots(db, pollId, scoreboardRows);
  await insertBattleLootSnapshots(db, pollId, lootRows);

  // NOW that poll + scoreboard + loot snapshots are durable, flip is_active
  // false for the battles that completed the finalize path cleanly. A crash
  // before this point leaves the row active for a retry with snapshots safe.
  for (const battleId of finalizeCandidates) {
    try {
      await markBattleFinalized(db, battleId, now);
      finalizedCount += 1;
    } catch (err) {
      errors.push(`markFinalized ${battleId}: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn(
        { battleId, err: err instanceof Error ? err.message : String(err) },
        "battle markFinalized failed",
      );
    }
  }

  logger.info(
    {
      pollId,
      battleCount,
      lootSnapshotCount: lootRows.length,
      finalizedCount,
      status,
      errors: errors.length,
      activeBattlePages: pages,
      paginationComplete: complete,
    },
    "battle info poll complete",
  );

  return {
    pollId,
    battleCount,
    lootSnapshotCount: lootRows.length,
    finalizedCount,
    status,
  };
}

/**
 * Fetch loot for every member of the battle's sticky MUs (deduped by userId to
 * the first MU that claims them) and append snapshot rows.
 *
 * Returns the number of member loot requests that failed with a non-not-found
 * error. Callers on the finalize path use this to decide whether to finalize.
 *
 * v1 note: this issues sequential `fetchBattleLootSummary` calls (one per
 * user). The production WarEra client's rate limiter already serializes, and
 * tests mock `.request` rather than `.requestBatch`, so a sequential loop is
 * the simplest correct shape here. Switch to `warera.requestBatch` with
 * `battleLootSummary.getByBattleAndUser` slots if batch throughput becomes a
 * concern.
 */
async function collectLoot(
  warera: WareraRequester,
  battleId: string,
  stickyMuIds: string[],
  rosterByMu: Map<string, string[]>,
  lootRows: BattleLootSnapshotRow[],
  recordedAt: Date,
  errors: string[],
  logger: Logger,
): Promise<number> {
  // Dedupe userId -> first sticky MU that owns it.
  const userToMu = new Map<string, string>();
  for (const muId of stickyMuIds) {
    const members = rosterByMu.get(muId) ?? [];
    for (const userId of members) {
      if (!userToMu.has(userId)) userToMu.set(userId, muId);
    }
  }

  let lootErrors = 0;
  for (const [userId, muId] of userToMu) {
    let loot: ParsedBattleLootSummary | null;
    try {
      loot = await fetchBattleLootSummary(warera, battleId, userId);
    } catch (err) {
      lootErrors += 1;
      errors.push(
        `loot ${battleId}/${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.warn(
        { battleId, userId, err: err instanceof Error ? err.message : String(err) },
        "battle loot fetch failed",
      );
      continue;
    }
    // NOT_FOUND -> skip the row, not an error.
    if (loot === null) continue;
    lootRows.push({
      battleId,
      userId,
      muId,
      totalDmg: loot.totalDmg,
      hits: loot.hits,
      totalMoneyFromBounty: loot.totalMoneyFromBounty,
      totalMoneyFromContract: loot.totalMoneyFromContract,
      case1Count: loot.case1Count,
      case2Count: loot.case2Count,
      poolLoot: loot.poolLoot,
      payload: loot.payload,
      recordedAt,
    });
  }
  return lootErrors;
}
