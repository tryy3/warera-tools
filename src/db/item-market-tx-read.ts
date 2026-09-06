import { and, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { itemMarketTransactions } from "./schema";

export type ItemMarketTxRow = {
  id: string;
  money: number;
  itemCode: string;
  skills: Record<string, unknown> | null;
  createdAt: Date;
};

export async function listItemMarketTxSince(
  db: Db,
  since: Date,
  itemCode?: string,
): Promise<ItemMarketTxRow[]> {
  const cond = itemCode
    ? and(
        gte(itemMarketTransactions.createdAt, since),
        eq(itemMarketTransactions.itemCode, itemCode),
      )
    : gte(itemMarketTransactions.createdAt, since);
  const rows = await db
    .select({
      id: itemMarketTransactions.id,
      money: itemMarketTransactions.money,
      itemCode: itemMarketTransactions.itemCode,
      skills: itemMarketTransactions.skills,
      createdAt: itemMarketTransactions.createdAt,
    })
    .from(itemMarketTransactions)
    .where(cond);
  return rows.map((r) => ({
    ...r,
    skills: r.skills ?? null,
  }));
}

export async function listItemMarketTxForItemCodes(
  db: Db,
  itemCodes: string[],
): Promise<ItemMarketTxRow[]> {
  if (itemCodes.length === 0) return [];
  const unique = [...new Set(itemCodes)];
  const rows = await db
    .select({
      id: itemMarketTransactions.id,
      money: itemMarketTransactions.money,
      itemCode: itemMarketTransactions.itemCode,
      skills: itemMarketTransactions.skills,
      createdAt: itemMarketTransactions.createdAt,
    })
    .from(itemMarketTransactions)
    .where(inArray(itemMarketTransactions.itemCode, unique));
  return rows.map((r) => ({
    ...r,
    skills: r.skills ?? null,
  }));
}
