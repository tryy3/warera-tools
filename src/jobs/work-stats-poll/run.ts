import { inArray } from "drizzle-orm";
import type { Db } from "../../db/client";
import { players } from "../../db/schema";
import { listDistinctFollowedPlayerIds } from "../../db/watch-reasons";
import { upsertCompanyWorkDays, upsertWorkerWorkDays } from "../../db/work-stats";
import type { Logger } from "../../logging/logger";
import { syncFollowedPlayers } from "../sync-followed-players";
import { fetchCompaniesByUserId } from "../../warera/companies";
import { fetchWorkers } from "../../warera/workers";
import { fetchWorkStatsBatch } from "../../warera/work-stats";
import type { WareraRequester } from "../../warera/prices";

type WorkerTarget = { companyId: string; workerId: string };

/**
 * Hourly poll of daily work stats for followed players' factories.
 *
 * 1. `syncFollowedPlayers` refreshes each followed player's current profile
 *    (so `players.workplace_company_id` is fresh) and reconciles their
 *    `follow_player` MU reason.
 * 2. For each followed player, owned companies are discovered via
 *    `company.getCompanies` + `company.getById`.
 * 3. For each unique owned company, the full worker roster is fetched
 *    (`worker.getWorkers`) — those become worker stat targets.
 * 4. Each followed player's *workplace* (if set) is added as a single
 *    worker target even when the workplace is not owned by a followed
 *    player. We never fetch the workplace's full roster in that case, so
 *    foreign companies only contribute the followed player's own row.
 * 5. `work.getStatsByCompany` is called for owned company ids only;
 *    `work.getStatsByWorkerAndCompany` is called for every worker target.
 *    Results are upserted into `company_work_stats` / `worker_work_stats`.
 *
 * Never calls `search.*`.
 */
export async function runWorkStatsPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{
  playerCount: number;
  companyCount: number;
  workerCount: number;
  companyDays: number;
  workerDays: number;
  status: "success" | "partial" | "error";
  errors: string[];
}> {
  const { db, warera, logger } = options;
  const recordedAt = new Date();

  const errors: string[] = [];
  const syncResult = await syncFollowedPlayers({ db, warera, now: recordedAt });
  for (const err of syncResult.errors) errors.push(`sync: ${err}`);
  const followedIds = await listDistinctFollowedPlayerIds(db);

  if (followedIds.length === 0) {
    const status = errors.length > 0 ? "partial" : "success";
    logger.info(
      {
        player_count: 0,
        company_count: 0,
        worker_count: 0,
        company_days: 0,
        worker_days: 0,
        status,
        errors: errors.length,
      },
      "work stats poll complete (empty watchlist)",
    );
    return {
      playerCount: 0,
      companyCount: 0,
      workerCount: 0,
      companyDays: 0,
      workerDays: 0,
      status,
      errors,
    };
  }

  const ownedCompanyIds = new Set<string>();

  for (const playerId of followedIds) {
    try {
      const companies = await fetchCompaniesByUserId(warera, playerId);
      for (const company of companies) ownedCompanyIds.add(company.id);
    } catch (err) {
      errors.push(`companies ${playerId}: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn(
        { player_id: playerId, err: err instanceof Error ? err.message : String(err) },
        "owned company fetch failed",
      );
    }
  }

  const workerTargets: WorkerTarget[] = [];
  const workerTargetKeys = new Set<string>();

  function addWorkerTarget(companyId: string, workerId: string): void {
    const key = `${companyId}\t${workerId}`;
    if (workerTargetKeys.has(key)) return;
    workerTargetKeys.add(key);
    workerTargets.push({ companyId, workerId });
  }

  for (const companyId of ownedCompanyIds) {
    try {
      const workers = await fetchWorkers(warera, { companyId });
      for (const worker of workers) addWorkerTarget(companyId, worker.userId);
    } catch (err) {
      errors.push(`workers ${companyId}: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn(
        { company_id: companyId, err: err instanceof Error ? err.message : String(err) },
        "worker roster fetch failed",
      );
    }
  }

  // Add each followed player's workplace as a single worker target. We do
  // not fetch the workplace's roster when it is not owned — only the
  // followed player's own row is added.
  const workplaces = await loadPlayerWorkplaces(db, followedIds);
  for (const playerId of followedIds) {
    const workplace = workplaces.get(playerId);
    if (workplace) addWorkerTarget(workplace, playerId);
  }

  const companyIds = [...ownedCompanyIds];
  const batch = await fetchWorkStatsBatch(warera, {
    companyIds,
    workerTargets,
  });

  let companyDays = 0;
  let workerDays = 0;
  let successCount = 0;
  const totalTargets = companyIds.length + workerTargets.length;

  for (const companyId of companyIds) {
    const days = batch.companies.get(companyId);
    if (!days) {
      errors.push(`work stats company ${companyId}: no data`);
      continue;
    }
    companyDays += await upsertCompanyWorkDays(db, companyId, days, recordedAt);
    successCount += 1;
  }

  for (const target of workerTargets) {
    const days = batch.workers.get(`${target.companyId}\t${target.workerId}`);
    if (!days) {
      errors.push(`work stats worker ${target.companyId}/${target.workerId}: no data`);
      continue;
    }
    workerDays += await upsertWorkerWorkDays(db, target, days, recordedAt);
    successCount += 1;
  }

  let status: "success" | "partial" | "error";
  if (totalTargets === 0 && errors.length === 0) {
    status = "success";
  } else if (successCount === 0) {
    status = "error";
  } else if (errors.length > 0 || successCount < totalTargets) {
    status = "partial";
  } else {
    status = "success";
  }

  logger.info(
    {
      player_count: followedIds.length,
      company_count: companyIds.length,
      worker_count: workerTargets.length,
      company_days: companyDays,
      worker_days: workerDays,
      status,
      errors: errors.length,
    },
    "work stats poll complete",
  );

  return {
    playerCount: followedIds.length,
    companyCount: companyIds.length,
    workerCount: workerTargets.length,
    companyDays,
    workerDays,
    status,
    errors,
  };
}

async function loadPlayerWorkplaces(db: Db, playerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (playerIds.length === 0) return out;
  const rows = await db
    .select({ id: players.id, workplace: players.workplaceCompanyId })
    .from(players)
    .where(inArray(players.id, playerIds));
  for (const row of rows) {
    if (row.workplace) out.set(row.id, row.workplace);
  }
  return out;
}
