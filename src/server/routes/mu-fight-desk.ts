import { desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../../db/client";
import {
  fightStateContentFingerprint,
  insertUserFightPoll,
  insertUserFightSnapshots,
  listLatestFightStatesForMu,
  listPeakFightStatesForUsers,
  loadLatestFightStateFingerprints,
  type UserFightSnapshotRow,
} from "../../db/user-fight-state";
import { listMuMembers } from "../../db/mus";
import { mus, muWatchReasons, userFightSnapshots } from "../../db/schema";
import type { Logger } from "../../logging/logger";
import {
  parseFightState,
  toFightPlayerInput,
  type ParsedFightState,
} from "../../warera/fight-state";
import type { WareraRequester } from "../../warera/prices";
import { fetchUserByIdRawBatch } from "../../warera/users";
import { HttpError } from "../errors";

export type MuFightDeskRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

async function refreshFightStates(
  deps: MuFightDeskRouteDeps,
  muId: string,
  userIds: string[],
  recordedAt: Date,
): Promise<string[]> {
  const { db, warera, logger } = deps;
  const payloads = await fetchUserByIdRawBatch(warera, userIds);
  const rows: UserFightSnapshotRow[] = [];
  const errors: string[] = [];
  const failedUserIds: string[] = [];

  for (const userId of userIds) {
    const raw = payloads.get(userId);
    const parsed = raw == null ? null : parseFightState(raw);
    if (!parsed || parsed.userId !== userId) {
      failedUserIds.push(userId);
      errors.push(`user ${userId}: lookup or fight-state parse failed`);
      continue;
    }
    rows.push({ ...parsed, muId, recordedAt });
  }

  const latestFingerprints = await loadLatestFightStateFingerprints(
    db,
    rows.map((row) => row.userId),
  );
  const deltas = rows.filter(
    (row) => latestFingerprints.get(row.userId) !== fightStateContentFingerprint(row),
  );
  const status =
    userIds.length === 0 || errors.length === 0
      ? "success"
      : rows.length === 0
        ? "error"
        : "partial";
  const pollId = await insertUserFightPoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.slice(0, 20).join("; ") : null,
    userCount: deltas.length,
    muCount: 1,
  });
  await insertUserFightSnapshots(db, pollId, deltas);

  logger.info(
    {
      poll_id: pollId,
      mu_id: muId,
      user_count: deltas.length,
      status,
      error_count: errors.length,
    },
    "fight desk refresh complete",
  );

  return failedUserIds;
}

function incompleteMember(userId: string, role: string | null, refreshFailed = false) {
  return {
    userId,
    username: null,
    level: null,
    role,
    incomplete: true,
    ...(refreshFailed ? { refreshFailed: true } : {}),
    fight: null,
    peakFight: null,
    display: {
      avatarUrl: null,
      militaryRankBonus: null,
      ammoLabel: null,
      pillLabel: null,
      pillEndsAt: null,
      skillLevels: {},
    },
  };
}

function completeMember(
  snapshot: ParsedFightState,
  peakSnapshot: ParsedFightState | null,
  role: string | null,
  refreshFailed = false,
) {
  return {
    userId: snapshot.userId,
    username: snapshot.username,
    level: snapshot.level,
    role,
    incomplete: false,
    ...(refreshFailed ? { refreshFailed: true } : {}),
    fight: toFightPlayerInput(snapshot),
    peakFight: toFightPlayerInput(peakSnapshot ?? snapshot),
    display: {
      avatarUrl: snapshot.avatarUrl,
      militaryRankBonus: snapshot.militaryRankBonus,
      ammoLabel: snapshot.ammoLabel,
      pillLabel: snapshot.pillLabel,
      pillEndsAt: snapshot.pillEndsAt?.toISOString() ?? null,
      skillLevels: snapshot.skillLevels,
    },
  };
}

export function muFightDeskRoutes(deps: MuFightDeskRouteDeps) {
  const { db } = deps;
  const app = new Hono();

  async function respond(muId: string, forceRefresh: boolean) {
    const now = new Date();
    const [muRows, roster, watchRows] = await Promise.all([
      db.select({ id: mus.id, name: mus.name }).from(mus).where(eq(mus.id, muId)).limit(1),
      listMuMembers(db, muId),
      db
        .select({ muId: muWatchReasons.muId })
        .from(muWatchReasons)
        .where(eq(muWatchReasons.muId, muId))
        .limit(1),
    ]);
    const mu = muRows[0];
    if (!mu) {
      throw new HttpError(404, "not_found", `MU ${muId} not found`);
    }

    let snapshots = await listLatestFightStatesForMu(db, muId);
    const watched = watchRows.length > 0;
    const shouldLiveFill = forceRefresh || (watched && snapshots.length === 0 && roster.length > 0);
    let refreshFailedUserIds: string[] = [];
    if (shouldLiveFill) {
      refreshFailedUserIds = await refreshFightStates(
        deps,
        muId,
        roster.map((member) => member.userId),
        now,
      );
      snapshots = await listLatestFightStatesForMu(db, muId);
    }

    const userIds = roster.map((member) => member.userId);
    const refreshFailedUserIdSet = new Set(refreshFailedUserIds);
    const asOfRow =
      userIds.length === 0
        ? null
        : (
            await db
              .select({ recordedAt: userFightSnapshots.recordedAt })
              .from(userFightSnapshots)
              .where(inArray(userFightSnapshots.userId, userIds))
              .orderBy(desc(userFightSnapshots.recordedAt), desc(userFightSnapshots.id))
              .limit(1)
          )[0];
    const snapshotByUserId = new Map(snapshots.map((snapshot) => [snapshot.userId, snapshot]));
    const peakByUserId = await listPeakFightStatesForUsers(db, userIds, now);

    return {
      mu,
      asOf: asOfRow?.recordedAt.toISOString() ?? null,
      members: roster.map((member) => {
        const snapshot = snapshotByUserId.get(member.userId);
        const refreshFailed = refreshFailedUserIdSet.has(member.userId);
        return snapshot
          ? completeMember(
              snapshot,
              peakByUserId.get(member.userId) ?? null,
              member.role,
              refreshFailed,
            )
          : incompleteMember(member.userId, member.role, refreshFailed);
      }),
      meta: { watched, liveFilled: shouldLiveFill, refreshFailedUserIds },
    };
  }

  app.get("/:muId/fight-desk", async (c) => c.json(await respond(c.req.param("muId"), false)));
  app.post("/:muId/fight-desk/refresh", async (c) =>
    c.json(await respond(c.req.param("muId"), true)),
  );

  return app;
}
