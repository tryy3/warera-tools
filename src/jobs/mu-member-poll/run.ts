import type { Db } from "../../db/client";
import {
  insertUserProfilePoll,
  insertUserProfileSnapshots,
  listDistinctWatchedMuMemberUserIds,
  type UserProfileSnapshotRow,
} from "../../db/user-profiles";
import type { Logger } from "../../logging/logger";
import type { WareraRequester } from "../../warera/prices";
import { fetchUserProfileBatch } from "../../warera/users";

export type MuMemberPollResult = {
  pollId: number;
  userCount: number;
  muCount: number;
  status: "success" | "partial" | "error";
};

export async function runMuMemberPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  now?: Date;
}): Promise<MuMemberPollResult> {
  const { db, warera, logger } = options;
  const recordedAt = options.now ?? new Date();
  const { userIds, muCount } = await listDistinctWatchedMuMemberUserIds(db);

  if (userIds.length === 0) {
    const pollId = await insertUserProfilePoll(db, {
      recordedAt,
      status: "success",
      userCount: 0,
      muCount,
    });
    logger.info(
      { poll_id: pollId, user_count: 0, mu_count: muCount, status: "success" },
      "mu member poll complete",
    );
    return { pollId, userCount: 0, muCount, status: "success" };
  }

  const profiles = await fetchUserProfileBatch(warera, userIds);
  const rows: UserProfileSnapshotRow[] = [];
  const errors: string[] = [];

  for (const userId of userIds) {
    const profile = profiles.get(userId);
    if (!profile) {
      errors.push(`user ${userId}: lookup failed`);
      continue;
    }
    rows.push({
      userId: profile.userId,
      recordedAt,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      countryId: profile.countryId,
      muId: profile.muId,
      companyId: profile.companyId,
      partyId: profile.partyId,
      isActive: profile.isActive,
      lastConnectionAt: profile.lastConnectionAt,
      lastWorkAt: profile.lastWorkAt,
      lastHelpAskedAt: profile.lastHelpAskedAt,
      lastDailyRewardClaimedAt: profile.lastDailyRewardClaimedAt,
      lastCompanyJoinedAt: profile.lastCompanyJoinedAt,
      lastDailyCalendarClaimedAt: profile.lastDailyCalendarClaimedAt,
      lastSkillsResetAt: profile.lastSkillsResetAt,
      level: profile.level,
      totalXp: profile.totalXp,
      dailyXpLeft: profile.dailyXpLeft,
      availableSkillPoints: profile.availableSkillPoints,
      spentSkillPoints: profile.spentSkillPoints,
      totalSkillPoints: profile.totalSkillPoints,
      prestigeLevel: profile.prestigeLevel,
      militaryRank: profile.militaryRank,
      isPremium: profile.isPremium,
      premiumMonthsCount: profile.premiumMonthsCount,
      createdAtGame: profile.createdAtGame,
    });
  }

  const status: MuMemberPollResult["status"] =
    rows.length === 0 ? "error" : errors.length > 0 ? "partial" : "success";
  const pollId = await insertUserProfilePoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.slice(0, 20).join("; ") : null,
    userCount: rows.length,
    muCount,
  });
  await insertUserProfileSnapshots(db, pollId, rows);

  logger.info(
    {
      poll_id: pollId,
      user_count: rows.length,
      mu_count: muCount,
      status,
      error_count: errors.length,
    },
    "mu member poll complete",
  );
  return { pollId, userCount: rows.length, muCount, status };
}
