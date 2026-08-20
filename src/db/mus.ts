import { asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { muMembers, mus } from "./schema";
import { listDistinctWatchedMuIds } from "./watch-reasons";
import type { ParsedMu } from "../warera/mu";

export async function listMusForSync(db: Db): Promise<string[]> {
  return listDistinctWatchedMuIds(db);
}

export async function upsertMuCurrent(db: Db, parsed: ParsedMu, fetchedAt: Date): Promise<void> {
  await db
    .insert(mus)
    .values({
      id: parsed.id,
      name: parsed.name,
      avatarUrl: parsed.avatarUrl,
      countryId: parsed.countryId,
      regionId: parsed.regionId,
      ownerUserId: parsed.ownerUserId,
      mercenaryReputation: parsed.mercenaryReputation,
      level: parsed.level,
      createdAtGame: parsed.createdAtGame,
      roles: parsed.roles,
      activeUpgradeLevels: parsed.activeUpgradeLevels,
      payload: parsed.payload,
      enqueuedAt: fetchedAt,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: mus.id,
      set: {
        name: parsed.name,
        avatarUrl: parsed.avatarUrl,
        countryId: parsed.countryId,
        regionId: parsed.regionId,
        ownerUserId: parsed.ownerUserId,
        mercenaryReputation: parsed.mercenaryReputation,
        level: parsed.level,
        createdAtGame: parsed.createdAtGame,
        roles: parsed.roles,
        activeUpgradeLevels: parsed.activeUpgradeLevels,
        payload: parsed.payload,
        fetchedAt,
      },
    });
}

export async function replaceMuMembers(
  db: Db,
  muId: string,
  members: { userId: string; role: string }[],
  updatedAt: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(muMembers).where(eq(muMembers.muId, muId));
    if (members.length === 0) return;
    await tx.insert(muMembers).values(
      members.map((m) => ({
        muId,
        userId: m.userId,
        role: m.role,
        updatedAt,
      })),
    );
  });
}

export async function listMuMembers(
  db: Db,
  muId: string,
): Promise<{ userId: string; role: string | null }[]> {
  const rows = await db
    .select({ userId: muMembers.userId, role: muMembers.role })
    .from(muMembers)
    .where(eq(muMembers.muId, muId))
    .orderBy(asc(muMembers.userId));
  return rows.map((r) => ({ userId: r.userId, role: r.role ?? null }));
}
