import type { GearTierId } from "../calculator";
import { scrapAmountForTier } from "../calculator";
import { txMoney, type ItemMarketTxRow } from "../db/item-market-tx-read";
import { isFiniteMoney, parseMoney, type Decimal } from "../money/decimal";
import { tierFromItemCode } from "./catalog";
import { median } from "./median";

export type OverviewItemRow = {
  itemCode: string;
  tier: GearTierId | null;
  marketMedian: Decimal | null;
  scrapFloor: Decimal | null;
  spread: Decimal | null;
  trades: number;
};

export type OverviewResult = {
  windowMs: number;
  scrapPrice: Decimal | null;
  scrapedAt: string | null;
  items: OverviewItemRow[];
};

export function buildEquipmentOverview(
  txs: ItemMarketTxRow[],
  scrapPrice: Decimal | number | null,
): OverviewResult["items"] {
  const scrap = parseMoney(scrapPrice);
  const byCode = new Map<string, Decimal[]>();
  for (const tx of txs) {
    const list = byCode.get(tx.itemCode);
    if (list) list.push(txMoney(tx));
    else byCode.set(tx.itemCode, [txMoney(tx)]);
  }

  const items: OverviewItemRow[] = [];
  for (const [itemCode, moneys] of byCode) {
    const tier = tierFromItemCode(itemCode);
    const marketMedian = median(moneys);
    const scrapFloor =
      tier != null && isFiniteMoney(scrap) ? scrap.times(scrapAmountForTier(tier)) : null;
    const spread =
      marketMedian != null && scrapFloor != null ? marketMedian.minus(scrapFloor) : null;
    items.push({
      itemCode,
      tier,
      marketMedian,
      scrapFloor,
      spread,
      trades: moneys.length,
    });
  }

  items.sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  return items;
}
