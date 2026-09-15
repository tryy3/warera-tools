import { inArray } from "drizzle-orm";
import type { Db } from "../../db/client";
import {
  fightStateContentFingerprint,
  insertUserFightPoll,
  insertUserFightSnapshots,
  loadLatestFightStateFingerprints,
  type UserFightSnapshotRow,
} from "../../db/user-fight-state";
import { muMembers } from "../../db/schema";
import { listDistinctWatchedMuMemberUserIds } from "../../db/user-profiles";
import type { Logger } from "../../logging/logger";
import { parseFightState } from "../../warera/fight-state";
import type { WareraRequester } from "../../warera/prices";
import { fetchUserByIdRawBatch, parseUserProfile } from "../../warera/users";
import { createFingerprintCache } from "../snapshot-fingerprint-cache";

export const fightStateFingerprintCache = createFingerprintCache();

export type MuFightPollResult = {
  pollId: number;
  userCount: number;
  muCount: number;
  status: "success" | "partial" | "error";
};

async function loadRosterMuIds(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ userId: muMembers.userId, muId: muMembers.muId })
    .from(muMembers)
    .where(inArray(muMembers.userId, userIds));
  for (const row of rows) {
    if (!out.has(row.userId)) out.set(row.userId, row.muId);
  }
  return out;
}

export async function runMuFightPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  now?: Date;
}): Promise<MuFightPollResult> {
  const { db, warera, logger } = options;
  const recordedAt = options.now ?? new Date();
  const { userIds, muCount } = await listDistinctWatchedMuMemberUserIds(db);

  if (userIds.length === 0) {
    const pollId = await insertUserFightPoll(db, {
      recordedAt,
      status: "success",
      userCount: 0,
      muCount,
    });
    logger.info(
      { poll_id: pollId, user_count: 0, mu_count: muCount, status: "success" },
      "mu fight poll complete",
    );
    return { pollId, userCount: 0, muCount, status: "success" };
  }

  const [payloads, rosterMuIds] = await Promise.all([
    fetchUserByIdRawBatch(warera, userIds),
    loadRosterMuIds(db, userIds),
  ]);
  const rows: UserFightSnapshotRow[] = [];
  const errors: string[] = [];

  for (const userId of userIds) {
    const raw = payloads.get(userId);
    const parsed = raw == null ? null : parseFightState(raw);
    if (!parsed || parsed.userId !== userId) {
      errors.push(`user ${userId}: lookup or fight-state parse failed`);
      continue;
    }

    let profileMuId: string | null = null;
    try {
      profileMuId = parseUserProfile(raw, userId).muId;
    } catch {
      // parseFightState already validated the requested user id.
    }
    const muId = profileMuId ?? rosterMuIds.get(userId);
    if (!muId) {
      errors.push(`user ${userId}: MU id unavailable`);
      continue;
    }
    rows.push({ ...parsed, muId, recordedAt });
  }

  const status: MuFightPollResult["status"] =
    rows.length === 0 ? "error" : errors.length > 0 ? "partial" : "success";
  await fightStateFingerprintCache.ensureWarmed(
    rows.map((row) => row.userId),
    (missing) => loadLatestFightStateFingerprints(db, missing),
  );
  const deltas = rows.filter(
    (row) => fightStateFingerprintCache.get(row.userId) !== fightStateContentFingerprint(row),
  );
  const pollId = await insertUserFightPoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.slice(0, 20).join("; ") : null,
    userCount: deltas.length,
    muCount,
  });
  await insertUserFightSnapshots(db, pollId, deltas);
  fightStateFingerprintCache.setMany(
    deltas.map((row) => [row.userId, fightStateContentFingerprint(row)]),
  );

  logger.info(
    {
      poll_id: pollId,
      user_count: deltas.length,
      mu_count: muCount,
      status,
      error_count: errors.length,
    },
    "mu fight poll complete",
  );
  return { pollId, userCount: deltas.length, muCount, status };
}
