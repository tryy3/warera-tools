import { inArray } from "drizzle-orm";
import type { ItemMarketTransaction } from "../warera/transactions";
import type { Db } from "./client";
import { itemMarketTransactions } from "./schema";

export async function findExistingItemMarketTransactionIds(
  db: Db,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: itemMarketTransactions.id })
    .from(itemMarketTransactions)
    .where(inArray(itemMarketTransactions.id, ids));
  return new Set(rows.map((r) => r.id));
}

export async function insertItemMarketTransactionsIgnoreConflicts(
  db: Db,
  txs: ItemMarketTransaction[],
  ingestedAt: Date = new Date(),
): Promise<{ inserted: number; existingIds: string[] }> {
  if (txs.length === 0) return { inserted: 0, existingIds: [] };
  const existing = await findExistingItemMarketTransactionIds(
    db,
    txs.map((t) => t.id),
  );
  const existingIds = [...existing];
  const fresh = txs.filter((t) => !existing.has(t.id));
  if (fresh.length > 0) {
    await db
      .insert(itemMarketTransactions)
      .values(
        fresh.map((t) => ({
          id: t.id,
          money: t.money,
          itemCode: t.itemCode,
          quantity: t.quantity,
          sellerId: t.sellerId,
          buyerId: t.buyerId,
          transactionType: t.transactionType,
          itemId: t.itemId,
          itemType: t.itemType,
          itemState: t.itemState,
          itemMaxState: t.itemMaxState,
          itemQuantity: t.itemQuantity,
          itemLastAcquisitionAt: t.itemLastAcquisitionAt,
          skills: t.skills,
          offerCreatedAt: t.offerCreatedAt,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          payload: t.payload,
          ingestedAt,
        })),
      )
      .onConflictDoNothing();
  }
  return { inserted: fresh.length, existingIds };
}
