import { and, asc, eq, gt, inArray, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "./client";
import { battleLootSnapshots, battleOrders, battles, mus } from "./schema";

export type BattleStripRow = {
  id: string;
  type: string | null;
  warId: string | null;
  isActive: boolean;
  attackerCountryId: string | null;
  defenderCountryId: string | null;
  attackerRegionId: string | null;
  defenderRegionId: string | null;
  attackerMuOrders: string[] | null;
  defenderMuOrders: string[] | null;
  attackerCountryOrders: string[] | null;
  defenderCountryOrders: string[] | null;
};

function jsonArrayIncludes(values: string[] | null, needle: string): boolean {
  return (values ?? []).includes(needle);
}

function toBattleStripRow(row: typeof battles.$inferSelect): BattleStripRow {
  return {
    id: row.id,
    type: row.type,
    warId: row.warId,
    isActive: row.isActive,
    attackerCountryId: row.attackerCountryId,
    defenderCountryId: row.defenderCountryId,
    attackerRegionId: row.attackerRegionId,
    defenderRegionId: row.defenderRegionId,
    attackerMuOrders: row.attackerMuOrders,
    defenderMuOrders: row.defenderMuOrders,
    attackerCountryOrders: row.attackerCountryOrders,
    defenderCountryOrders: row.defenderCountryOrders,
  };
}

async function loadMuCountryId(db: Db, muId: string): Promise<string | null> {
  const [row] = await db
    .select({ countryId: mus.countryId })
    .from(mus)
    .where(eq(mus.id, muId))
    .limit(1);
  return row?.countryId ?? null;
}

function battleMatchesMu(
  row: typeof battles.$inferSelect,
  muId: string,
  countryId: string | null,
  orderBattleIds: Set<string>,
): boolean {
  if (orderBattleIds.has(row.id)) return true;
  if (
    jsonArrayIncludes(row.attackerMuOrders, muId) ||
    jsonArrayIncludes(row.defenderMuOrders, muId)
  ) {
    return true;
  }
  if (countryId == null) return false;
  return (
    jsonArrayIncludes(row.attackerCountryOrders, countryId) ||
    jsonArrayIncludes(row.defenderCountryOrders, countryId)
  );
}

export async function listFightDeskBattles(db: Db, muId: string): Promise<BattleStripRow[]> {
  const countryId = await loadMuCountryId(db, muId);
  const activeRows = await db
    .select()
    .from(battles)
    .where(eq(battles.isActive, true))
    .orderBy(asc(battles.id));

  const orderPredicates = [
    and(eq(battleOrders.ownerType, "mu"), eq(battleOrders.ownerId, muId)),
  ];
  if (countryId != null) {
    orderPredicates.push(
      and(eq(battleOrders.ownerType, "country"), eq(battleOrders.ownerId, countryId)),
    );
  }

  const orderRows =
    orderPredicates.length === 0
      ? []
      : await db
          .select({ battleId: battleOrders.battleId })
          .from(battleOrders)
          .where(or(...orderPredicates));

  const orderBattleIds = new Set(orderRows.map((row) => row.battleId));

  return activeRows
    .filter((row) => battleMatchesMu(row, muId, countryId, orderBattleIds))
    .map(toBattleStripRow);
}

export async function listLatestMuDamageByBattle(
  db: Db,
  muId: string,
  battleIds: string[],
): Promise<Map<string, number>> {
  const uniqueBattleIds = [...new Set(battleIds.filter((id) => id.length > 0))];
  const out = new Map<string, number>();
  if (uniqueBattleIds.length === 0) return out;

  const newerLoot = alias(battleLootSnapshots, "newer_battle_loot");

  const rows = await db
    .select({
      battleId: battleLootSnapshots.battleId,
      totalDmg: battleLootSnapshots.totalDmg,
    })
    .from(battleLootSnapshots)
    .where(
      and(
        eq(battleLootSnapshots.muId, muId),
        inArray(battleLootSnapshots.battleId, uniqueBattleIds),
        notExists(
          db
            .select({ id: newerLoot.id })
            .from(newerLoot)
            .where(
              and(
                eq(newerLoot.battleId, battleLootSnapshots.battleId),
                eq(newerLoot.userId, battleLootSnapshots.userId),
                or(
                  gt(newerLoot.recordedAt, battleLootSnapshots.recordedAt),
                  and(
                    eq(newerLoot.recordedAt, battleLootSnapshots.recordedAt),
                    gt(newerLoot.id, battleLootSnapshots.id),
                  ),
                ),
              ),
            ),
        ),
      ),
    );

  for (const row of rows) {
    if (row.totalDmg == null) continue;
    out.set(row.battleId, (out.get(row.battleId) ?? 0) + row.totalDmg);
  }

  return out;
}
