import type { Db } from "../../db/client";
import {
  insertDonationPoll,
  insertDonationSnapshots,
  type DonationSnapshotRow,
} from "../../db/donations";
import {
  ensureSwedenCountryWatchReason,
  listDistinctWatchedCountryIds,
  listDistinctWatchedMuIds,
} from "../../db/watch-reasons";
import type { Logger } from "../../logging/logger";
import { drainDonations } from "../../warera/donations";
import type { WareraRequester } from "../../warera/prices";

export async function runDonationPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{
  pollId: number;
  scopeCount: number;
  rowCount: number;
  status: "success" | "partial" | "error";
}> {
  const { db, warera, logger } = options;
  const recordedAt = new Date();
  await ensureSwedenCountryWatchReason(db, recordedAt);

  const muIds = await listDistinctWatchedMuIds(db);
  const countryIds = await listDistinctWatchedCountryIds(db);
  const scopes: { scopeType: "mu" | "country"; scopeId: string }[] = [
    ...muIds.map((scopeId) => ({ scopeType: "mu" as const, scopeId })),
    ...countryIds.map((scopeId) => ({ scopeType: "country" as const, scopeId })),
  ];

  const errors: string[] = [];
  const rows: DonationSnapshotRow[] = [];
  let scopeSuccesses = 0;

  for (const scope of scopes) {
    try {
      const donations = await drainDonations(warera, scope);
      for (const d of donations) {
        rows.push({
          scopeType: d.scopeType,
          scopeId: d.scopeId,
          userId: d.userId,
          donationRowId: d.donationRowId,
          amount: d.amount,
          donationCreatedAt: d.donationCreatedAt,
          donationUpdatedAt: d.donationUpdatedAt,
          payload: d.payload,
        });
      }
      scopeSuccesses += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${scope.scopeType}:${scope.scopeId}: ${msg}`);
      logger.warn(
        { scope_type: scope.scopeType, scope_id: scope.scopeId, err: msg },
        "donation scope drain failed",
      );
    }
  }

  const status = scopeSuccesses === 0 ? "error" : errors.length > 0 ? "partial" : "success";

  const pollId = await insertDonationPoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
    scopeCount: scopeSuccesses,
    rowCount: rows.length,
  });
  await insertDonationSnapshots(db, pollId, rows);

  logger.info(
    {
      poll_id: pollId,
      scope_count: scopeSuccesses,
      row_count: rows.length,
      status,
      errors: errors.length,
    },
    "donation poll complete",
  );

  return { pollId, scopeCount: scopeSuccesses, rowCount: rows.length, status };
}
