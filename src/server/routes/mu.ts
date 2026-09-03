import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../../db/client";
import {
  getLatestMemberStatSnapshots,
  getLatestMuStatSnapshot,
  getMuMemberStatHistory,
  getMuStatHistory,
  type LatestMemberStatSnapshot,
  type LatestMuStatSnapshot,
  type MuMemberStatHistoryPoint,
} from "../../db/mu-history";
import { listMuMembers, replaceMuMembers, upsertMuCurrent } from "../../db/mus";
import { upsertPlayerCurrent } from "../../db/players";
import { mus, muWatchReasons, players } from "../../db/schema";
import { MANUAL_SOURCE_ID, WATCH_REASON_MANUAL, insertMuWatchReason } from "../../db/watch-reasons";
import type { MemberHistoryMetric, MuHistoryMetric } from "../../mu/metrics";
import {
  DEFAULT_MEMBER_METRIC,
  DEFAULT_MU_METRIC,
  isMemberHistoryMetric,
  isMuHistoryMetric,
} from "../../mu/metrics";
import { parseMuHistoryRange } from "../../mu/ranges";
import { isWareraNotFoundError } from "../../warera/errors";
import {
  deriveMemberRole,
  fetchMuById,
  fetchMuMembersByMu,
  type ParsedMuMember,
  type ParsedMuStats,
} from "../../warera/mu";
import type { WareraRequester } from "../../warera/prices";
import { fetchUserLiteBatch } from "../../warera/users";
import type { Logger } from "../../logging/logger";
import { HttpError } from "../errors";

export type MuRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

type LatestMuStatsResponse = Partial<Record<MuHistoryMetric, number | null>> & {
  weeklyDamagesRank?: number | null;
  weeklyDamagesTier?: string | null;
  bountyRank?: number | null;
  bountyTier?: string | null;
  reputationRank?: number | null;
  reputationTier?: string | null;
  damagesRank?: number | null;
  damagesTier?: string | null;
  terrainRank?: number | null;
  terrainTier?: string | null;
  wealthRank?: number | null;
  wealthTier?: string | null;
};

type MemberLatest = Partial<Record<MemberHistoryMetric, number | null>>;

type MuHistoryScope = "mu" | "members";

function parseMuHistoryScope(value: unknown): MuHistoryScope {
  if (value === "members") return "members";
  return "mu";
}

function memberLabel(userId: string, username: string | null | undefined): string {
  return username ?? userId.slice(0, 8);
}

function groupMemberHistory(rows: MuMemberStatHistoryPoint[]) {
  const byUser = new Map<string, { recordedAt: Date; value: number | null }[]>();
  for (const row of rows) {
    let points = byUser.get(row.userId);
    if (!points) {
      points = [];
      byUser.set(row.userId, points);
    }
    points.push({ recordedAt: row.recordedAt, value: row.value });
  }
  return [...byUser.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, points]) => ({ userId, points }));
}

function mapLookupError(err: unknown, entity: "MU"): never {
  const message = err instanceof Error ? err.message : `${entity} lookup failed`;
  if (isWareraNotFoundError(err)) {
    throw new HttpError(404, "not_found", message);
  }
  throw new HttpError(502, "upstream_error", message);
}

async function loadUsernamesById(db: Db, ids: string[]): Promise<Map<string, string | null>> {
  const usernameById = new Map<string, string | null>();
  if (ids.length === 0) return usernameById;
  const unique = [...new Set(ids)];
  const playerRows = await db
    .select({ id: players.id, username: players.username })
    .from(players)
    .where(inArray(players.id, unique));
  for (const row of playerRows) {
    usernameById.set(row.id, row.username);
  }
  return usernameById;
}

async function resolveMemberUsernames(
  db: Db,
  warera: WareraRequester,
  ids: string[],
  now: Date,
): Promise<Map<string, string | null>> {
  const usernameById = await loadUsernamesById(db, ids);
  const missing = [...new Set(ids)].filter((id) => {
    const username = usernameById.get(id);
    return username == null || username.length === 0;
  });
  if (missing.length === 0 || !warera.requestBatch) return usernameById;

  const liteById = await fetchUserLiteBatch(warera, missing);
  for (const userId of missing) {
    const lite = liteById.get(userId);
    const username = lite?.username ?? null;
    if (username) {
      usernameById.set(userId, username);
      await upsertPlayerCurrent(db, {
        id: userId,
        username,
        muId: null,
        workplaceCompanyId: null,
        payload: null,
        fetchedAt: now,
      });
    } else if (!usernameById.has(userId)) {
      usernameById.set(userId, null);
    }
  }
  return usernameById;
}

function memberLatestFromSnapshot(snapshot: LatestMemberStatSnapshot): MemberLatest {
  return {
    totalDamagesCount: snapshot.totalDamagesCount,
    monthlyDamagesCount: snapshot.monthlyDamagesCount,
    weeklyDamagesCount: snapshot.weeklyDamagesCount,
    totalHelpCount: snapshot.totalHelpCount,
    monthlyHelpCount: snapshot.monthlyHelpCount,
    weeklyHelpCount: snapshot.weeklyHelpCount,
  };
}

function memberLatestFromParsed(member: ParsedMuMember): MemberLatest {
  return {
    totalDamagesCount: member.totalDamagesCount,
    monthlyDamagesCount: member.monthlyDamagesCount,
    weeklyDamagesCount: member.weeklyDamagesCount,
    totalHelpCount: member.totalHelpCount,
    monthlyHelpCount: member.monthlyHelpCount,
    weeklyHelpCount: member.weeklyHelpCount,
  };
}

function latestMuStatsFromSnapshot(snapshot: LatestMuStatSnapshot): LatestMuStatsResponse {
  return {
    weeklyDamages: snapshot.weeklyDamages,
    weeklyDamagesRank: snapshot.weeklyDamagesRank,
    weeklyDamagesTier: snapshot.weeklyDamagesTier,
    bounty: snapshot.bounty,
    bountyRank: snapshot.bountyRank,
    bountyTier: snapshot.bountyTier,
    reputation: snapshot.reputation,
    reputationRank: snapshot.reputationRank,
    reputationTier: snapshot.reputationTier,
    damages: snapshot.damages,
    damagesRank: snapshot.damagesRank,
    damagesTier: snapshot.damagesTier,
    terrain: snapshot.terrain,
    terrainRank: snapshot.terrainRank,
    terrainTier: snapshot.terrainTier,
    wealth: snapshot.wealth,
    wealthRank: snapshot.wealthRank,
    wealthTier: snapshot.wealthTier,
    levelingLevel: snapshot.levelingLevel,
    levelingMonthlyDamages: snapshot.levelingMonthlyDamages,
  };
}

function latestMuStatsFromParsed(stats: ParsedMuStats): LatestMuStatsResponse {
  return {
    weeklyDamages: stats.weeklyDamages,
    weeklyDamagesRank: stats.weeklyDamagesRank,
    weeklyDamagesTier: stats.weeklyDamagesTier,
    bounty: stats.bounty,
    bountyRank: stats.bountyRank,
    bountyTier: stats.bountyTier,
    reputation: stats.reputation,
    reputationRank: stats.reputationRank,
    reputationTier: stats.reputationTier,
    damages: stats.damages,
    damagesRank: stats.damagesRank,
    damagesTier: stats.damagesTier,
    terrain: stats.terrain,
    terrainRank: stats.terrainRank,
    terrainTier: stats.terrainTier,
    wealth: stats.wealth,
    wealthRank: stats.wealthRank,
    wealthTier: stats.wealthTier,
    levelingLevel: stats.levelingLevel,
    levelingMonthlyDamages: stats.levelingMonthlyDamages,
  };
}

export function muRoutes(deps: MuRouteDeps) {
  const { db, warera } = deps;
  const app = new Hono();

  app.get("/:id/history", async (c) => {
    const id = c.req.param("id");
    const now = new Date();
    const range = parseMuHistoryRange(c.req.query("range"));
    const scope = parseMuHistoryScope(c.req.query("scope"));
    const metricRaw = c.req.query("metric");

    const existing = await db.select({ id: mus.id }).from(mus).where(eq(mus.id, id)).limit(1);
    if (!existing[0]) {
      throw new HttpError(404, "not_found", `MU ${id} not found`);
    }

    if (scope === "members") {
      const metric = metricRaw ?? DEFAULT_MEMBER_METRIC;
      if (!isMemberHistoryMetric(metric)) {
        throw new HttpError(400, "bad_request", `Invalid metric for members scope: ${metric}`);
      }
      const rows = await getMuMemberStatHistory(db, id, metric, range, now);
      const grouped = groupMemberHistory(rows);
      const usernameById = await resolveMemberUsernames(
        db,
        warera,
        grouped.map((s) => s.userId),
        now,
      );
      return c.json({
        range,
        scope: "members" as const,
        metric,
        series: grouped.map((s) => ({
          userId: s.userId,
          label: memberLabel(s.userId, usernameById.get(s.userId)),
          points: s.points.map((p) => ({
            recordedAt: p.recordedAt.toISOString(),
            value: p.value,
          })),
        })),
      });
    }

    const metric = metricRaw ?? DEFAULT_MU_METRIC;
    if (!isMuHistoryMetric(metric)) {
      throw new HttpError(400, "bad_request", `Invalid metric for mu scope: ${metric}`);
    }
    const points = await getMuStatHistory(db, id, metric, range, now);
    return c.json({
      range,
      scope: "mu" as const,
      metric,
      points: points.map((p) => ({
        recordedAt: p.recordedAt.toISOString(),
        value: p.value,
      })),
    });
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const now = new Date();
    let liveFilled = false;
    let coldMemberLatest = new Map<string, MemberLatest>();
    let coldMuStats: ParsedMuStats | null = null;

    const existing = await db.select({ id: mus.id }).from(mus).where(eq(mus.id, id)).limit(1);

    if (!existing[0]) {
      let parsed;
      try {
        parsed = await fetchMuById(warera, id);
      } catch (err) {
        mapLookupError(err, "MU");
      }

      await upsertMuCurrent(db, parsed, now);
      await replaceMuMembers(
        db,
        parsed.id,
        parsed.memberUserIds.map((userId) => ({
          userId,
          role: deriveMemberRole(userId, parsed.ownerUserId, parsed.roles),
        })),
        now,
      );

      try {
        const liveMembers = await fetchMuMembersByMu(warera, parsed.id);
        for (const member of liveMembers) {
          coldMemberLatest.set(member.userId, memberLatestFromParsed(member));
        }
      } catch {
        // Partial current is ok when member fetch fails after successful getById.
      }

      coldMuStats = parsed.stats;

      await insertMuWatchReason(db, {
        muId: parsed.id,
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at: now,
      });

      liveFilled = true;
    }

    const muRow = (await db.select().from(mus).where(eq(mus.id, id)).limit(1))[0];
    if (!muRow) {
      throw new HttpError(404, "not_found", `MU ${id} not found`);
    }

    const memberRows = await listMuMembers(db, id);
    const usernameById = await resolveMemberUsernames(
      db,
      warera,
      memberRows.map((m) => m.userId),
      now,
    );

    const snapshotByUserId = new Map<string, MemberLatest>();
    if (!liveFilled) {
      const snapshots = await getLatestMemberStatSnapshots(db, id);
      for (const snapshot of snapshots) {
        snapshotByUserId.set(snapshot.userId, memberLatestFromSnapshot(snapshot));
      }
    }

    const members = memberRows.map((member) => ({
      userId: member.userId,
      role: member.role,
      username: usernameById.get(member.userId) ?? null,
      latest: liveFilled
        ? (coldMemberLatest.get(member.userId) ?? null)
        : (snapshotByUserId.get(member.userId) ?? null),
    }));

    let latestMuStats: LatestMuStatsResponse | null = null;
    let historyAvailable = false;
    if (liveFilled && coldMuStats) {
      latestMuStats = latestMuStatsFromParsed(coldMuStats);
    } else {
      const snapshot = await getLatestMuStatSnapshot(db, id);
      if (snapshot) {
        latestMuStats = latestMuStatsFromSnapshot(snapshot);
        historyAvailable = true;
      }
    }

    const watchRows = await db
      .select({ muId: muWatchReasons.muId })
      .from(muWatchReasons)
      .where(eq(muWatchReasons.muId, id))
      .limit(1);

    return c.json({
      mu: {
        id: muRow.id,
        name: muRow.name,
        avatarUrl: muRow.avatarUrl,
        countryId: muRow.countryId,
        regionId: muRow.regionId,
        level: muRow.level,
        mercenaryReputation: muRow.mercenaryReputation,
        fetchedAt: muRow.fetchedAt?.toISOString() ?? null,
      },
      members,
      latestMuStats,
      meta: {
        watched: watchRows.length > 0,
        historyAvailable,
        liveFilled,
      },
    });
  });

  return app;
}
