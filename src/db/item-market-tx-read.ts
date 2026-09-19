import { and, eq, gte, inArray } from "drizzle-orm";
import { parseMoney, type Decimal } from "../money/decimal";
import type { Db } from "./client";
import { itemMarketTransactions } from "./schema";

export type ItemMarketTxRow = {
  id: string;
  /** Decimal from DB; tests may pass numbers (coerced at domain boundaries). */
  money: Decimal | number;
  itemCode: string;
  skills: Record<string, unknown> | null;
  createdAt: Date;
};

function mapTxRow(r: {
  id: string;
  money: Decimal;
  itemCode: string;
  skills: Record<string, unknown> | null;
  createdAt: Date;
}): ItemMarketTxRow {
  return {
    id: r.id,
    money: r.money,
    itemCode: r.itemCode,
    skills: r.skills ?? null,
    createdAt: r.createdAt,
  };
}

export function txMoney(row: ItemMarketTxRow): Decimal {
  return parseMoney(row.money)!;
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
