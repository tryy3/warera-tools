import { createFileRoute } from "@tanstack/react-router";
import { EconomyPage } from "../features/economy/EconomyPage";
import { parseEconomySearch } from "../lib/economySearch";

export const Route = createFileRoute("/economy")({
  validateSearch: (search: Record<string, unknown>) => parseEconomySearch(search),
  component: EconomyPage,
});
