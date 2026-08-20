import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../../db/client";
import { upsertMuCurrent } from "../../db/mus";
import { upsertPlayerCurrent } from "../../db/players";
import { mus, muWatchReasons, players, playerWatchReasons } from "../../db/schema";
import {
  MANUAL_SOURCE_ID,
  WATCH_REASON_FOLLOW_PLAYER,
  WATCH_REASON_MANUAL,
  deleteFollowPlayerReasonsForSource,
  deleteMuWatchReason,
  insertMuWatchReason,
  insertPlayerWatchReason,
  reconcileFollowPlayerMu,
} from "../../db/watch-reasons";
import type { Logger } from "../../logging/logger";
import { fetchMuById } from "../../warera/mu";
import { fetchUserById } from "../../warera/users";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type FollowRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

type PlayerReason = { reason: string; sourceId: string };
type MuReason = { reason: string; sourceId: string; sourceUsername: string | null };

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
    reasons: reasonRows.map((r) => ({ reason: r.reason, sourceId: r.sourceId })),
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

  // Resolve sourceUsername for follow_player reasons (sourceId is a playerId).
  const followSources = reasonRows
    .filter((r) => r.reason === WATCH_REASON_FOLLOW_PLAYER)
    .map((r) => r.sourceId);
  const usernameById = new Map<string, string | null>();
  if (followSources.length > 0) {
    const unique = [...new Set(followSources)];
    const playerRows = await db
      .select({ id: players.id, username: players.username })
      .from(players);
    for (const row of playerRows) {
      if (unique.includes(row.id)) {
        usernameById.set(row.id, row.username);
      }
    }
  }

  const muRow = await db.select({ name: mus.name }).from(mus).where(eq(mus.id, muId)).limit(1);

  return {
    muId,
    name: muRow[0]?.name ?? null,
    reasons: reasonRows.map((r) => ({
      reason: r.reason,
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

    const playerRows = await db
      .select({
        id: players.id,
        username: players.username,
        muId: players.muId,
        workplaceCompanyId: players.workplaceCompanyId,
      })
      .from(players);
    const profileById = new Map(playerRows.map((r) => [r.id, r]));

    const reasonsByPlayer = new Map<string, PlayerReason[]>();
    for (const row of reasonRows) {
      const list = reasonsByPlayer.get(row.playerId) ?? [];
      list.push({ reason: row.reason, sourceId: row.sourceId });
      reasonsByPlayer.set(row.playerId, list);
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

    let ref;
    try {
      ref = await fetchUserById(warera, playerId);
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "User lookup failed",
      );
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await insertPlayerWatchReason(tx, {
        playerId: ref.userId,
        reason: WATCH_REASON_MANUAL,
        sourceId: MANUAL_SOURCE_ID,
        at: now,
      });
      await upsertPlayerCurrent(tx, {
        id: ref.userId,
        username: ref.username,
        muId: ref.muId,
        workplaceCompanyId: ref.companyId,
        payload: null,
        fetchedAt: now,
      });
      await reconcileFollowPlayerMu(tx, { playerId: ref.userId, muId: ref.muId, at: now });
    });

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

    const muRows = await db.select({ id: mus.id, name: mus.name }).from(mus);
    const nameById = new Map(muRows.map((r) => [r.id, r.name]));

    const followSources = reasonRows
      .filter((r) => r.reason === WATCH_REASON_FOLLOW_PLAYER)
      .map((r) => r.sourceId);
    const usernameById = new Map<string, string | null>();
    if (followSources.length > 0) {
      const unique = [...new Set(followSources)];
      const playerRows = await db
        .select({ id: players.id, username: players.username })
        .from(players);
      for (const row of playerRows) {
        if (unique.includes(row.id)) {
          usernameById.set(row.id, row.username);
        }
      }
    }

    const reasonsByMu = new Map<string, MuReason[]>();
    for (const row of reasonRows) {
      const list = reasonsByMu.get(row.muId) ?? [];
      list.push({
        reason: row.reason,
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

    // Fetch FIRST so a failed lookup never leaves a dangling manual reason.
    let parsed;
    try {
      parsed = await fetchMuById(warera, muId);
    } catch (err) {
      throw new HttpError(
        502,
        "upstream_error",
        err instanceof Error ? err.message : "MU lookup failed",
      );
    }

    const now = new Date();
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
