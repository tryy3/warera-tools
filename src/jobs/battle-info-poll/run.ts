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

  // Watchlist + rosters (Geo/User-tier reads; no live WarEra calls here).
  const watchedMuIds = await listMusForSync(db);
  const watchedSet = new Set(watchedMuIds);
  const rosterByMu = new Map<string, string[]>();
  for (const muId of watchedMuIds) {
    const members = await listMuMembers(db, muId);
    rosterByMu.set(
      muId,
      members.map((m) => m.userId),
    );
  }

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
  const scoreboardRows: BattleScoreboardSnapshotRow[] = [];
  const lootRows: BattleLootSnapshotRow[] = [];
  let finalizedCount = 0;

  for (const row of dbActive) {
    const parsed = activeById.get(row.id) ?? null;
    const stickyMuIds = row.stickyMuIds ?? [];

    if (parsed) {
      // Still active upstream — capture a scoreboard snapshot and loot.
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

    // Past grace — finalize with a single getById, final loot, then close.
    try {
      const fresh = await fetchBattleById(warera, row.id);
      await upsertBattleFromParsed(db, fresh, {
        stickyMuIds,
        fetchedAt: now,
        isActive: false,
      });
      await collectLoot(warera, row.id, stickyMuIds, rosterByMu, lootRows, now, errors, logger);
      await markBattleFinalized(db, row.id, now);
      finalizedCount += 1;
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
    scoreboardRows.length > 0 || lootRows.length > 0 || finalizedCount > 0 || battleCount > 0;
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
    finalizedCount,
  });
  await insertBattleScoreboardSnapshots(db, pollId, scoreboardRows);
  await insertBattleLootSnapshots(db, pollId, lootRows);

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
): Promise<void> {
  // Dedupe userId -> first sticky MU that owns it.
  const userToMu = new Map<string, string>();
  for (const muId of stickyMuIds) {
    const members = rosterByMu.get(muId) ?? [];
    for (const userId of members) {
      if (!userToMu.has(userId)) userToMu.set(userId, muId);
    }
  }

  for (const [userId, muId] of userToMu) {
    let loot: ParsedBattleLootSummary | null;
    try {
      loot = await fetchBattleLootSummary(warera, battleId, userId);
    } catch (err) {
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
}
