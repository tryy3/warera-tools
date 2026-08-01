import { createFileRoute } from "@tanstack/react-router";
import { MarketItemPage } from "../features/market/MarketItemPage";
import { parseMarketItemSearch } from "../lib/marketSearch";

export const Route = createFileRoute("/market_/$itemCode")({
  validateSearch: (search: Record<string, unknown>) => parseMarketItemSearch(search),
  component: MarketItemPage,
});
