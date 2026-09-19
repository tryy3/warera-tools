import { and, eq, gte, inArray } from "drizzle-orm";
import { moneyToNumber } from "../money/decimal";
import type { Db } from "./client";
import { itemMarketTransactions } from "./schema";

export type ItemMarketTxRow = {
  id: string;
  money: number;
  itemCode: string;
  skills: Record<string, unknown> | null;
  createdAt: Date;
};

function mapTxRow(r: {
  id: string;
  money: Parameters<typeof moneyToNumber>[0];
  itemCode: string;
  skills: Record<string, unknown> | null;
  createdAt: Date;
}): ItemMarketTxRow {
  const money = moneyToNumber(r.money);
  if (money == null) throw new Error(`item_market_transactions.money missing for ${r.id}`);
  return {
    id: r.id,
    money,
    itemCode: r.itemCode,
    skills: r.skills ?? null,
    createdAt: r.createdAt,
  };
}

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
  return rows.map(mapTxRow);
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
  return rows.map(mapTxRow);
}
