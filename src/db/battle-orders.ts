import { asc, eq } from "drizzle-orm";
import type { ParsedBattleOrder } from "../warera/battle-orders";
import type { Db } from "./client";
import { battleOrders } from "./schema";

export async function replaceBattleOrders(
  db: Db,
  battleId: string,
  orders: ParsedBattleOrder[],
  fetchedAt: Date,
): Promise<void> {
  await db.delete(battleOrders).where(eq(battleOrders.battleId, battleId));
  if (orders.length === 0) return;

  await db.insert(battleOrders).values(
    orders.map((order) => ({
      battleId,
      ownerType: order.ownerType,
      ownerId: order.ownerId,
      side: order.side,
      priority: order.priority,
      fetchedAt,
    })),
  );
}

export async function listBattleOrders(db: Db, battleId: string): Promise<ParsedBattleOrder[]> {
  const rows = await db
    .select()
    .from(battleOrders)
    .where(eq(battleOrders.battleId, battleId))
    .orderBy(asc(battleOrders.ownerType), asc(battleOrders.ownerId));

  return rows.map((row) => ({
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    side: row.side,
    priority: row.priority,
    payload: null,
  }));
}
