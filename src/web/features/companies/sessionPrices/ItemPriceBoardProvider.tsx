import { createContext, use, useMemo, useState, type ReactNode } from "react";
import type { BookPrices } from "../../../../economy/profit";
import type { Opportunity } from "../types";
import {
  bookFromOpportunities,
  isItemDirty,
  isSideDirty,
  mergeBookPrices,
  pruneOverrides,
  recomputeOpportunities,
} from "./effective";
import type { ItemPriceOverrides } from "./types";

export type ItemPriceBoardContextValue = {
  overrides: ItemPriceOverrides;
  liveBook: BookPrices;
  effectiveBook: BookPrices;
  opportunities: Opportunity[];
  setItemPrices: (
    itemCode: string,
    prices: { buy?: number | undefined; sell?: number | undefined },
  ) => void;
  resetItem: (itemCode: string) => void;
  isDirty: (itemCode: string, side?: "buy" | "sell") => boolean;
  liveOpportunity: (itemCode: string) => Opportunity | undefined;
};

const ItemPriceBoardContext = createContext<ItemPriceBoardContextValue | null>(null);

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

export function useItemPriceBoard(): ItemPriceBoardContextValue {
  const value = use(ItemPriceBoardContext);
  if (!value) {
    throw new Error("useItemPriceBoard must be used within ItemPriceBoardProvider");
  }
  return value;
}
