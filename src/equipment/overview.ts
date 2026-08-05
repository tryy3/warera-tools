import type { GearTierId } from "../calculator";
import { scrapAmountForTier } from "../calculator";
import type { ItemMarketTxRow } from "../db/item-market-tx-read";
import { tierFromItemCode } from "./catalog";
import { median } from "./median";

export type OverviewItemRow = {
  itemCode: string;
  tier: GearTierId | null;
  marketMedian: number | null;
  scrapFloor: number | null;
  spread: number | null;
  trades: number;
};

export type OverviewResult = {
  windowMs: number;
  scrapPrice: number | null;
  scrapedAt: string | null;
  items: OverviewItemRow[];
};

export function buildEquipmentOverview(
  txs: ItemMarketTxRow[],
  scrapPrice: number | null,
): OverviewResult["items"] {
  const byCode = new Map<string, number[]>();
  for (const tx of txs) {
    const list = byCode.get(tx.itemCode);
    if (list) list.push(tx.money);
    else byCode.set(tx.itemCode, [tx.money]);
  }

  const items: OverviewItemRow[] = [];
  for (const [itemCode, moneys] of byCode) {
    const tier = tierFromItemCode(itemCode);
    const marketMedian = median(moneys);
    const scrapFloor =
      tier != null && scrapPrice != null ? scrapAmountForTier(tier) * scrapPrice : null;
    const spread =
      marketMedian != null && scrapFloor != null ? marketMedian - scrapFloor : null;
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
