import { asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { muMembers, mus } from "./schema";
import { SEED_MU_ID, type ParsedMu } from "../warera/mu";

export async function ensureSeedMu(db: Db, now = new Date()): Promise<void> {
  const existing = await listMusForSync(db);
  if (existing.length > 0) return;
  await db.insert(mus).values({ id: SEED_MU_ID, enqueuedAt: now }).onConflictDoNothing();
}

export async function listMusForSync(db: Db): Promise<{ id: string }[]> {
  const rows = await db.select({ id: mus.id }).from(mus);
  return rows;
}

export async function upsertMuCurrent(
  db: Db,
  parsed: ParsedMu,
  fetchedAt: Date,
): Promise<void> {
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
  await db.delete(muMembers).where(eq(muMembers.muId, muId));
  if (members.length === 0) return;
  await db.insert(muMembers).values(
    members.map((m) => ({
      muId,
      userId: m.userId,
      role: m.role,
      updatedAt,
    })),
  );
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
