import { and, asc, eq, or } from "drizzle-orm";
import { moneyToNumber } from "../money/decimal";
import type { Db } from "./client";
import { itemMarketTransactions } from "./schema";

export type PlayerItemFillRow = {
  id: string;
  money: number;
  quantity: number;
  buyerId: string;
  sellerId: string;
  createdAt: Date;
};

export async function listPlayerItemFills(
  db: Db,
  opts: { playerId: string; itemCode: string },
): Promise<PlayerItemFillRow[]> {
  const { playerId, itemCode } = opts;
  const rows = await db
    .select({
      id: itemMarketTransactions.id,
      money: itemMarketTransactions.money,
      quantity: itemMarketTransactions.quantity,
      buyerId: itemMarketTransactions.buyerId,
      sellerId: itemMarketTransactions.sellerId,
      createdAt: itemMarketTransactions.createdAt,
    })
    .from(itemMarketTransactions)
    .where(
      and(
        eq(itemMarketTransactions.itemCode, itemCode),
        or(
          eq(itemMarketTransactions.buyerId, playerId),
          eq(itemMarketTransactions.sellerId, playerId),
        ),
      ),
    )
    .orderBy(asc(itemMarketTransactions.createdAt));
  return rows.map((r) => {
    const money = moneyToNumber(r.money);
    if (money == null) throw new Error(`item_market_transactions.money missing for ${r.id}`);
    return { ...r, money };
  });
}
