import { and, desc, eq, gt, gte, inArray, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { pickHighestAtkSnapshot } from "../fight-damage/peak-pick";
import type { ParsedFightState } from "../warera/fight-state";
import type { Db } from "./client";
import { muMembers, userFightPolls, userFightSnapshots, type PricePollStatus } from "./schema";

export const FIGHT_PEAK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type UserFightSnapshotRow = ParsedFightState & {
  muId: string;
  recordedAt: Date;
};

function dateFingerprint(value: Date | null): number | null {
  return value?.getTime() ?? null;
}

export function fightStateContentFingerprint(row: UserFightSnapshotRow): string {
  // TODO: Separate material combat changes from volatile HP/hunger before pruning history.
  return JSON.stringify([
    row.userId,
    row.muId,
    row.username,
    row.level,
    row.militaryRankBonus,
    row.ammoLabel,
    row.pillLabel,
    dateFingerprint(row.pillEndsAt),
    Object.entries(row.skillLevels).toSorted(([left], [right]) => left.localeCompare(right)),
    dateFingerprint(row.lastSkillsResetAt),
    row.avatarUrl,
    row.atk,
    row.precision,
    row.critChance,
    row.critDamage,
    row.armor,
    row.dodge,
    row.hp,
    row.maxHp,
    row.hunger,
    row.maxHunger,
    row.hpRegenPerHour,
    row.hungerRegenPerHour,
    row.pillStatus,
  ]);
}

export async function loadLatestFightStateFingerprints(
  db: Db,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  await Promise.all(
    unique.map(async (userId) => {
      const latest = await getLatestSnapshotRow(db, userId);
      if (latest) out.set(userId, fightStateContentFingerprint(toSnapshotRow(latest)));
    }),
  );
  return out;
}

export async function insertUserFightPoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: PricePollStatus;
    error?: string | null;
    userCount: number;
    muCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(userFightPolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      userCount: values.userCount,
      muCount: values.muCount,
    })
    .returning({ id: userFightPolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert user_fight_polls row");
  return id;
}

function toSnapshotRow(row: typeof userFightSnapshots.$inferSelect): UserFightSnapshotRow {
  return {
    userId: row.userId,
    muId: row.muId,
    recordedAt: row.recordedAt,
    username: row.username,
    level: row.level,
    militaryRankBonus: row.militaryRankBonus,
    ammoLabel: row.ammoLabel,
    pillLabel: row.pillLabel,
    pillEndsAt: row.pillEndsAt,
    skillLevels: row.skillLevels,
    lastSkillsResetAt: row.lastSkillsResetAt,
    avatarUrl: row.avatarUrl,
    atk: row.atk,
    precision: row.precision,
    critChance: row.critChance,
    critDamage: row.critDamage,
    armor: row.armor,
    dodge: row.dodge,
    hp: row.hp,
    maxHp: row.maxHp,
    hunger: row.hunger,
    maxHunger: row.maxHunger,
    hpRegenPerHour: row.hpRegenPerHour,
    hungerRegenPerHour: row.hungerRegenPerHour,
    pillStatus: row.pillStatus,
  };
}

function toParsedFightState(row: typeof userFightSnapshots.$inferSelect): ParsedFightState {
  const { muId: _muId, recordedAt: _recordedAt, ...state } = toSnapshotRow(row);
  return state;
}

async function getLatestSnapshotRow(
  db: Db,
  userId: string,
): Promise<typeof userFightSnapshots.$inferSelect | null> {
  const rows = await db
    .select()
    .from(userFightSnapshots)
    .where(eq(userFightSnapshots.userId, userId))
    .orderBy(desc(userFightSnapshots.recordedAt), desc(userFightSnapshots.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertUserFightSnapshots(
  db: Db,
  pollId: number,
  rows: UserFightSnapshotRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const latestFingerprints = new Map<string, string>();
  const userIds = [...new Set(rows.map((row) => row.userId))];
  await Promise.all(
    userIds.map(async (userId) => {
      const latest = await getLatestSnapshotRow(db, userId);
      if (latest) {
        latestFingerprints.set(userId, fightStateContentFingerprint(toSnapshotRow(latest)));
      }
    }),
  );

  const sortedRows = [...rows]
    .map((row, index) => ({ row, index }))
    .toSorted((left, right) => {
      const userCompare = left.row.userId.localeCompare(right.row.userId);
      if (userCompare !== 0) return userCompare;
      const timeCompare = left.row.recordedAt.getTime() - right.row.recordedAt.getTime();
      if (timeCompare !== 0) return timeCompare;
      return left.index - right.index;
    })
    .map(({ row }) => row);

  const changedRows: UserFightSnapshotRow[] = [];
  for (const row of sortedRows) {
    const fingerprint = fightStateContentFingerprint(row);
    if (latestFingerprints.get(row.userId) === fingerprint) continue;
    changedRows.push(row);
    latestFingerprints.set(row.userId, fingerprint);
  }
  if (changedRows.length === 0) return 0;

  await db.insert(userFightSnapshots).values(
    changedRows.map((row) => ({
      pollId,
      ...row,
    })),
  );
  return changedRows.length;
}

export async function getLatestFightState(
  db: Db,
  userId: string,
): Promise<ParsedFightState | null> {
  const row = await getLatestSnapshotRow(db, userId);
  return row ? toParsedFightState(row) : null;
}

export async function listPeakFightStatesForUsers(
  db: Db,
  userIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ParsedFightState>> {
  const out = new Map<string, ParsedFightState>();
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return out;

  const since = new Date(now.getTime() - FIGHT_PEAK_WINDOW_MS);
  const rows = await db
    .select()
    .from(userFightSnapshots)
    .where(
      and(inArray(userFightSnapshots.userId, unique), gte(userFightSnapshots.recordedAt, since)),
    );

  const byUser = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  for (const [userId, list] of byUser) {
    const peak = pickHighestAtkSnapshot(list);
    if (peak) out.set(userId, toParsedFightState(peak));
  }
  return out;
}

export async function listLatestFightStatesForMu(
  db: Db,
  muId: string,
): Promise<ParsedFightState[]> {
  const newerSnapshot = alias(userFightSnapshots, "newer_fight_snapshot");

  const rows = await db
    .select({ snapshot: userFightSnapshots })
    .from(userFightSnapshots)
    .innerJoin(muMembers, eq(muMembers.userId, userFightSnapshots.userId))
    .where(
      and(
        eq(muMembers.muId, muId),
        notExists(
          db
            .select({ id: newerSnapshot.id })
            .from(newerSnapshot)
            .where(
              and(
                eq(newerSnapshot.userId, userFightSnapshots.userId),
                or(
                  gt(newerSnapshot.recordedAt, userFightSnapshots.recordedAt),
                  and(
                    eq(newerSnapshot.recordedAt, userFightSnapshots.recordedAt),
                    gt(newerSnapshot.id, userFightSnapshots.id),
                  ),
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(userFightSnapshots.userId);
  return rows.map(({ snapshot }) => toParsedFightState(snapshot));
}
