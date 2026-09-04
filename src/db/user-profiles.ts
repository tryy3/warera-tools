import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { muMembers, userProfilePolls, userProfileSnapshots } from "./schema";
import { listDistinctWatchedMuIds } from "./watch-reasons";

export const USER_PROFILE_JOB_MAX_AGE_MS = 10 * 60 * 1000;

export type UserProfileSnapshotRow = {
  userId: string;
  recordedAt: Date;
  username: string | null;
  avatarUrl: string | null;
  countryId: string | null;
  muId: string | null;
  companyId: string | null;
  partyId: string | null;
  isActive: boolean | null;
  lastConnectionAt: Date | null;
  lastWorkAt: Date | null;
  lastHelpAskedAt: Date | null;
  lastDailyRewardClaimedAt: Date | null;
  lastCompanyJoinedAt: Date | null;
  lastDailyCalendarClaimedAt: Date | null;
  lastSkillsResetAt: Date | null;
  level: number | null;
  totalXp: number | null;
  dailyXpLeft: number | null;
  availableSkillPoints: number | null;
  spentSkillPoints: number | null;
  totalSkillPoints: number | null;
  prestigeLevel: number | null;
  militaryRank: number | null;
  isPremium: boolean | null;
  premiumMonthsCount: number | null;
  createdAtGame: Date | null;
};

export async function listDistinctWatchedMuMemberUserIds(
  db: Db,
): Promise<{ userIds: string[]; muCount: number }> {
  const muIds = await listDistinctWatchedMuIds(db);
  if (muIds.length === 0) return { userIds: [], muCount: 0 };
  const rows = await db
    .select({ userId: muMembers.userId })
    .from(muMembers)
    .where(inArray(muMembers.muId, muIds));
  return {
    userIds: [...new Set(rows.map((row) => row.userId))],
    muCount: muIds.length,
  };
}

export async function insertUserProfilePoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: string;
    error?: string | null;
    userCount: number;
    muCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(userProfilePolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      userCount: values.userCount,
      muCount: values.muCount,
    })
    .returning({ id: userProfilePolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert user_profile_polls row");
  return id;
}

export async function insertUserProfileSnapshots(
  db: Db,
  pollId: number,
  rows: UserProfileSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(userProfileSnapshots).values(
    rows.map((row) => ({
      pollId,
      ...row,
    })),
  );
}

export async function getLatestUserProfile(
  db: Db,
  userId: string,
): Promise<(UserProfileSnapshotRow & { pollId: number; id: number }) | null> {
  const rows = await db
    .select()
    .from(userProfileSnapshots)
    .where(eq(userProfileSnapshots.userId, userId))
    .orderBy(desc(userProfileSnapshots.recordedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    pollId: row.pollId,
    userId: row.userId,
    recordedAt: row.recordedAt,
    username: row.username,
    avatarUrl: row.avatarUrl,
    countryId: row.countryId,
    muId: row.muId,
    companyId: row.companyId,
    partyId: row.partyId,
    isActive: row.isActive,
    lastConnectionAt: row.lastConnectionAt,
    lastWorkAt: row.lastWorkAt,
    lastHelpAskedAt: row.lastHelpAskedAt,
    lastDailyRewardClaimedAt: row.lastDailyRewardClaimedAt,
    lastCompanyJoinedAt: row.lastCompanyJoinedAt,
    lastDailyCalendarClaimedAt: row.lastDailyCalendarClaimedAt,
    lastSkillsResetAt: row.lastSkillsResetAt,
    level: row.level,
    totalXp: row.totalXp,
    dailyXpLeft: row.dailyXpLeft,
    availableSkillPoints: row.availableSkillPoints,
    spentSkillPoints: row.spentSkillPoints,
    totalSkillPoints: row.totalSkillPoints,
    prestigeLevel: row.prestigeLevel,
    militaryRank: row.militaryRank,
    isPremium: row.isPremium,
    premiumMonthsCount: row.premiumMonthsCount,
    createdAtGame: row.createdAtGame,
  };
}
