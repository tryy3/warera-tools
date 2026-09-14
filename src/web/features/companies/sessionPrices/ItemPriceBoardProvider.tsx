import { useMemo, useState, type ReactNode } from "react";
import type { Opportunity } from "../types";
import {
  bookFromOpportunities,
  isItemDirty,
  isSideDirty,
  mergeBookPrices,
  pruneOverrides,
  recomputeOpportunities,
} from "./effective";
import { ItemPriceBoardContext, type ItemPriceBoardContextValue } from "./item-price-board-context";
import type { ItemPriceOverrides } from "./types";

export function ItemPriceBoardProvider({
  liveOpportunities,
  children,
}: {
  liveOpportunities: Opportunity[];
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<ItemPriceOverrides>({});

  const liveBook = useMemo(() => bookFromOpportunities(liveOpportunities), [liveOpportunities]);
  const effectiveBook = useMemo(() => mergeBookPrices(liveBook, overrides), [liveBook, overrides]);
  const opportunities = useMemo(
    () => recomputeOpportunities(liveOpportunities, effectiveBook),
    [liveOpportunities, effectiveBook],
  );

  const liveByCode = useMemo(() => {
    const map = new Map<string, Opportunity>();
    for (const o of liveOpportunities) map.set(o.itemCode, o);
    return map;
  }, [liveOpportunities]);

  const value = useMemo<ItemPriceBoardContextValue>(
    () => ({
      overrides,
      liveBook,
      effectiveBook,
      opportunities,
      setItemPrices(itemCode, prices) {
        setOverrides((prev) => {
          const current = { ...prev[itemCode] };
          if (prices.buy == null || !Number.isFinite(prices.buy)) {
            delete current.buy;
          } else {
            current.buy = prices.buy;
          }
          if (prices.sell == null || !Number.isFinite(prices.sell)) {
            delete current.sell;
          } else {
            current.sell = prices.sell;
          }
          return pruneOverrides({ ...prev, [itemCode]: current });
        });
      },
      resetItem(itemCode) {
        setOverrides((prev) => {
          if (prev[itemCode] == null) return prev;
          const next = { ...prev };
          delete next[itemCode];
          return next;
        });
      },
      isDirty(itemCode, side) {
        if (side) return isSideDirty(overrides, itemCode, side);
        return isItemDirty(overrides, itemCode);
      },
      liveOpportunity(itemCode) {
        return liveByCode.get(itemCode);
      },
    }),
    [overrides, liveBook, effectiveBook, opportunities, liveByCode],
  );

  return <ItemPriceBoardContext value={value}>{children}</ItemPriceBoardContext>;
}
