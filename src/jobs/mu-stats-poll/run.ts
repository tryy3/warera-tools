import type { Db } from "../../db/client";
import { listMusForSync, replaceMuMembers, upsertMuCurrent } from "../../db/mus";
import {
  insertMuMemberStatSnapshots,
  insertMuPoll,
  insertMuStatSnapshots,
  type MuMemberStatSnapshotRow,
  type MuStatSnapshotRow,
} from "../../db/mu-stats";
import type { Logger } from "../../logging/logger";
import { syncFollowedPlayers } from "../sync-followed-players";
import { deriveMemberRole, fetchMuById, fetchMuMembersByMu, type ParsedMu } from "../../warera/mu";
import type { WareraRequester } from "../../warera/prices";

function statsToRow(mu: ParsedMu): MuStatSnapshotRow {
  const s = mu.stats;
  return {
    muId: mu.id,
    weeklyDamages: s.weeklyDamages,
    weeklyDamagesRank: s.weeklyDamagesRank,
    weeklyDamagesTier: s.weeklyDamagesTier,
    bounty: s.bounty,
    bountyRank: s.bountyRank,
    bountyTier: s.bountyTier,
    reputation: s.reputation,
    reputationRank: s.reputationRank,
    reputationTier: s.reputationTier,
    damages: s.damages,
    damagesRank: s.damagesRank,
    damagesTier: s.damagesTier,
    terrain: s.terrain,
    terrainRank: s.terrainRank,
    terrainTier: s.terrainTier,
    wealth: s.wealth,
    wealthRank: s.wealthRank,
    wealthTier: s.wealthTier,
    levelingLevel: s.levelingLevel,
    levelingMonthlyDamages: s.levelingMonthlyDamages,
    payload: null,
  };
}

export async function runMuStatsPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{
  pollId: number;
  muCount: number;
  memberCount: number;
  status: "success" | "partial" | "error";
}> {
  const { db, warera, logger } = options;
  const recordedAt = new Date();

  await syncFollowedPlayers({ db, warera, now: recordedAt });
  const watchlist = await listMusForSync(db);

  if (watchlist.length === 0) {
    const pollId = await insertMuPoll(db, {
      recordedAt,
      status: "success",
      error: null,
      muCount: 0,
      memberCount: 0,
    });
    logger.info({ pollId, muCount: 0, memberCount: 0 }, "mu stats poll complete");
    return { pollId, muCount: 0, memberCount: 0, status: "success" };
  }

  const muRows: MuStatSnapshotRow[] = [];
  const memberRows: MuMemberStatSnapshotRow[] = [];
  const errors: string[] = [];
  let fullSuccesses = 0;

  for (const muId of watchlist) {
    try {
      const mu = await fetchMuById(warera, muId);
      await upsertMuCurrent(db, mu, recordedAt);
      await replaceMuMembers(
        db,
        mu.id,
        mu.memberUserIds.map((userId) => ({
          userId,
          role: deriveMemberRole(userId, mu.ownerUserId, mu.roles),
        })),
        recordedAt,
      );

      muRows.push(statsToRow(mu));

      try {
        const members = await fetchMuMembersByMu(warera, muId);
        for (const m of members) {
          memberRows.push({
            muId: m.muId,
            userId: m.userId,
            memberRowId: m.memberRowId,
            totalDamagesCount: m.totalDamagesCount,
            monthlyDamagesCount: m.monthlyDamagesCount,
            weeklyDamagesCount: m.weeklyDamagesCount,
            totalHelpCount: m.totalHelpCount,
            monthlyHelpCount: m.monthlyHelpCount,
            weeklyHelpCount: m.weeklyHelpCount,
            payload: m.payload,
          });
        }
        fullSuccesses += 1;
      } catch (err) {
        errors.push(`muMember ${muId}: ${err instanceof Error ? err.message : String(err)}`);
        logger.warn(
          { muId, err: err instanceof Error ? err.message : String(err) },
          "mu member stats fetch failed",
        );
      }
    } catch (err) {
      errors.push(`mu ${muId}: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn(
        { muId, err: err instanceof Error ? err.message : String(err) },
        "mu getById failed",
      );
    }
  }

  const status =
    muRows.length === 0
      ? "error"
      : errors.length > 0 || fullSuccesses < watchlist.length
        ? "partial"
        : "success";

  const pollId = await insertMuPoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
    muCount: muRows.length,
    memberCount: memberRows.length,
  });
  await insertMuStatSnapshots(db, pollId, muRows);
  await insertMuMemberStatSnapshots(db, pollId, memberRows);

  logger.info(
    {
      pollId,
      muCount: muRows.length,
      memberCount: memberRows.length,
      status,
      errors: errors.length,
    },
    "mu stats poll complete",
  );

  return { pollId, muCount: muRows.length, memberCount: memberRows.length, status };
}
