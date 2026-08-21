import { asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../../db/client";
import { upsertMuCurrent } from "../../db/mus";
import { mus, muWatchReasons, players, playerWatchReasons } from "../../db/schema";
import {
  MANUAL_SOURCE_ID,
  WATCH_REASON_FOLLOW_PLAYER,
  WATCH_REASON_MANUAL,
  type WatchReason,
  deleteFollowPlayerReasonsForSource,
  deleteMuWatchReason,
  insertMuWatchReason,
  insertPlayerWatchReason,
} from "../../db/watch-reasons";
import { syncFollowedPlayers } from "../../jobs/sync-followed-players";
import { isWareraNotFoundError } from "../../warera/errors";
import { fetchMuById } from "../../warera/mu";
import { fetchUserById } from "../../warera/users";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type FollowRouteDeps = {
  db: Db;
  warera: WareraRequester;
};

type PlayerReason = { reason: WatchReason; sourceId: string };
type MuReason = { reason: WatchReason; sourceId: string; sourceUsername: string | null };

type PlayerView = {
  playerId: string;
  username: string | null;
  muId: string | null;
  workplaceCompanyId: string | null;
  reasons: PlayerReason[];
};

type MuView = {
  muId: string;
  name: string | null;
  reasons: MuReason[];
};

function asWatchReason(reason: string): WatchReason {
  if (reason === WATCH_REASON_MANUAL || reason === WATCH_REASON_FOLLOW_PLAYER) {
    return reason;
  }
  // Future reason strings still surface in the API as opaque text via cast.
  return reason as WatchReason;
}

function parseJsonBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_body", "Request body must be an object");
  }
  return body as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "invalid_body", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function mapLookupError(err: unknown, entity: "User" | "MU"): never {
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

async function buildPlayerView(
  db: Db,
  playerId: string,
  profile: {
    username: string | null;
    muId: string | null;
    workplaceCompanyId: string | null;
  } | null,
): Promise<PlayerView> {
  const reasonRows = await db
    .select({ reason: playerWatchReasons.reason, sourceId: playerWatchReasons.sourceId })
    .from(playerWatchReasons)
    .where(eq(playerWatchReasons.playerId, playerId))
    .orderBy(asc(playerWatchReasons.reason), asc(playerWatchReasons.sourceId));
  return {
    playerId,
    username: profile?.username ?? null,
    muId: profile?.muId ?? null,
    workplaceCompanyId: profile?.workplaceCompanyId ?? null,
    reasons: reasonRows.map((r) => ({ reason: asWatchReason(r.reason), sourceId: r.sourceId })),
  };
}

async function buildMuView(db: Db, muId: string): Promise<MuView> {
  const reasonRows = await db
    .select({
      reason: muWatchReasons.reason,
      sourceId: muWatchReasons.sourceId,
    })
    .from(muWatchReasons)
    .where(eq(muWatchReasons.muId, muId))
    .orderBy(asc(muWatchReasons.reason), asc(muWatchReasons.sourceId));

  const followSources = reasonRows
    .filter((r) => r.reason === WATCH_REASON_FOLLOW_PLAYER)
    .map((r) => r.sourceId);
  const usernameById = await loadUsernamesById(db, followSources);

  const muRow = await db.select({ name: mus.name }).from(mus).where(eq(mus.id, muId)).limit(1);

  return {
    muId,
    name: muRow[0]?.name ?? null,
    reasons: reasonRows.map((r) => ({
      reason: asWatchReason(r.reason),
      sourceId: r.sourceId,
      sourceUsername:
        r.reason === WATCH_REASON_FOLLOW_PLAYER ? (usernameById.get(r.sourceId) ?? null) : null,
    })),
  };
}

export function followRoutes(deps: FollowRouteDeps) {
  const { db, warera } = deps;
  const app = new Hono();

  app.get("/players", async (c) => {
    const reasonRows = await db
      .select({
        playerId: playerWatchReasons.playerId,
        reason: playerWatchReasons.reason,
        sourceId: playerWatchReasons.sourceId,
      })
      .from(playerWatchReasons)
      .orderBy(asc(playerWatchReasons.playerId), asc(playerWatchReasons.reason));

    const reasonsByPlayer = new Map<string, PlayerReason[]>();
    for (const row of reasonRows) {
      const list = reasonsByPlayer.get(row.playerId) ?? [];
      list.push({ reason: asWatchReason(row.reason), sourceId: row.sourceId });
      reasonsByPlayer.set(row.playerId, list);
    }

    const followedIds = [...reasonsByPlayer.keys()];
    const profileById = new Map<
      string,
      {
        username: string | null;
        muId: string | null;
        workplaceCompanyId: string | null;
      }
    >();
    if (followedIds.length > 0) {
      const playerRows = await db
        .select({
          id: players.id,
          username: players.username,
          muId: players.muId,
          workplaceCompanyId: players.workplaceCompanyId,
        })
        .from(players)
        .where(inArray(players.id, followedIds));
      for (const row of playerRows) {
        profileById.set(row.id, row);
      }
    }

    const out: PlayerView[] = [];
    for (const [playerId, reasons] of reasonsByPlayer) {
      const profile = profileById.get(playerId);
      out.push({
        playerId,
        username: profile?.username ?? null,
        muId: profile?.muId ?? null,
        workplaceCompanyId: profile?.workplaceCompanyId ?? null,
        reasons,
      });
    }
    return c.json({ players: out });
  });

  app.post("/players", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HttpError(400, "invalid_body", "Request body must be JSON");
    }
    const body = parseJsonBody(raw);
    const playerId = requireNonEmptyString(body.playerId, "playerId");

    // Validate existence before inserting a reason (404 vs upstream).
    let ref;
    try {
      ref = await fetchUserById(warera, playerId);
    } catch (err) {
      mapLookupError(err, "User");
    }

    const now = new Date();
    await insertPlayerWatchReason(db, {
      playerId: ref.userId,
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at: now,
    });

    // Shared job/UI path: upsert players + reconcile follow_player MU reasons.
    await syncFollowedPlayers({ db, warera, now });

    const player = await buildPlayerView(db, ref.userId, {
      username: ref.username,
      muId: ref.muId,
      workplaceCompanyId: ref.companyId,
    });
    return c.json({ player });
  });

  app.delete("/players/:playerId", async (c) => {
    const playerId = c.req.param("playerId");
    const existing = await db
      .select({ playerId: playerWatchReasons.playerId })
      .from(playerWatchReasons)
      .where(eq(playerWatchReasons.playerId, playerId))
      .limit(1);
    if (!existing[0]) {
      throw new HttpError(404, "not_found", `Player ${playerId} not followed`);
    }

    await db.transaction(async (tx) => {
      await tx.delete(playerWatchReasons).where(eq(playerWatchReasons.playerId, playerId));
      await deleteFollowPlayerReasonsForSource(tx, playerId);
    });
    return c.json({ ok: true });
  });

  app.get("/mus", async (c) => {
    const reasonRows = await db
      .select({
        muId: muWatchReasons.muId,
        reason: muWatchReasons.reason,
        sourceId: muWatchReasons.sourceId,
      })
      .from(muWatchReasons)
      .orderBy(asc(muWatchReasons.muId), asc(muWatchReasons.reason));

    const watchedMuIds = [...new Set(reasonRows.map((r) => r.muId))];
    const nameById = new Map<string, string | null>();
    if (watchedMuIds.length > 0) {
      const muRows = await db
        .select({ id: mus.id, name: mus.name })
        .from(mus)
        .where(inArray(mus.id, watchedMuIds));
      for (const row of muRows) {
        nameById.set(row.id, row.name);
      }
    }

    const followSources = reasonRows
      .filter((r) => r.reason === WATCH_REASON_FOLLOW_PLAYER)
      .map((r) => r.sourceId);
    const usernameById = await loadUsernamesById(db, followSources);

    const reasonsByMu = new Map<string, MuReason[]>();
    for (const row of reasonRows) {
      const list = reasonsByMu.get(row.muId) ?? [];
      list.push({
        reason: asWatchReason(row.reason),
        sourceId: row.sourceId,
        sourceUsername:
          row.reason === WATCH_REASON_FOLLOW_PLAYER
            ? (usernameById.get(row.sourceId) ?? null)
            : null,
      });
      reasonsByMu.set(row.muId, list);
    }

    const out: MuView[] = [];
    for (const [muId, reasons] of reasonsByMu) {
      out.push({ muId, name: nameById.get(muId) ?? null, reasons });
    }
    return c.json({ mus: out });
  });

  app.post("/mus", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HttpError(400, "invalid_body", "Request body must be JSON");
    }
    const body = parseJsonBody(raw);
    const muId = requireNonEmptyString(body.muId, "muId");
    const now = new Date();

    // Warm mus row: insert reason only (no live Geo scrape). Cold: fetch then upsert.
    const existing = await db.select({ id: mus.id }).from(mus).where(eq(mus.id, muId)).limit(1);
    if (existing[0]) {
      await insertMuWatchReason(db, {
        muId: existing[0].id,
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at: now,
      });
      const mu = await buildMuView(db, existing[0].id);
      return c.json({ mu });
    }

    let parsed;
    try {
      parsed = await fetchMuById(warera, muId);
    } catch (err) {
      mapLookupError(err, "MU");
    }

    await db.transaction(async (tx) => {
      await insertMuWatchReason(tx, {
        muId: parsed.id,
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at: now,
      });
      await upsertMuCurrent(tx, parsed, now);
    });

    const mu = await buildMuView(db, parsed.id);
    return c.json({ mu });
  });

  app.delete("/mus/:muId", async (c) => {
    const muId = c.req.param("muId");
    const allReasons = await db
      .select({
        reason: muWatchReasons.reason,
        sourceId: muWatchReasons.sourceId,
      })
      .from(muWatchReasons)
      .where(eq(muWatchReasons.muId, muId));
    const hasManual = allReasons.some(
      (r) => r.reason === WATCH_REASON_MANUAL && r.sourceId === MANUAL_SOURCE_ID,
    );
    if (!hasManual) {
      throw new HttpError(404, "not_found", `MU ${muId} not manually watched`);
    }

    await deleteMuWatchReason(db, {
      muId,
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
    });
    return c.json({ ok: true });
  });

  return app;
}
