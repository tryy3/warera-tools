import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../../db/client";
import {
  getLatestMemberStatSnapshots,
  getLatestMuStatSnapshot,
  type LatestMemberStatSnapshot,
  type LatestMuStatSnapshot,
} from "../../db/mu-history";
import { listMuMembers, replaceMuMembers, upsertMuCurrent } from "../../db/mus";
import { mus, muWatchReasons, players } from "../../db/schema";
import { MANUAL_SOURCE_ID, WATCH_REASON_MANUAL, insertMuWatchReason } from "../../db/watch-reasons";
import type { MemberHistoryMetric, MuHistoryMetric } from "../../mu/metrics";
import { isWareraNotFoundError } from "../../warera/errors";
import {
  deriveMemberRole,
  fetchMuById,
  fetchMuMembersByMu,
  type ParsedMuMember,
  type ParsedMuStats,
} from "../../warera/mu";
import type { WareraRequester } from "../../warera/prices";
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
    const usernameById = await loadUsernamesById(
      db,
      memberRows.map((m) => m.userId),
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
