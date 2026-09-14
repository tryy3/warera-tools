import { createContext, use } from "react";
import type { BookPrices } from "../../../../economy/profit";
import type { Opportunity } from "../types";
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

export const ItemPriceBoardContext = createContext<ItemPriceBoardContextValue | null>(null);

export function useItemPriceBoard(): ItemPriceBoardContextValue {
  const value = use(ItemPriceBoardContext);
  if (!value) {
    throw new Error("useItemPriceBoard must be used within ItemPriceBoardProvider");
  }
  return value;
}
