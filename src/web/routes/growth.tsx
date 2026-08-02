import { createFileRoute } from "@tanstack/react-router";
import { GrowthPage } from "../features/growth/GrowthPage";
import { parseGrowthSearch } from "../lib/growthSearch";

export const Route = createFileRoute("/growth")({
  validateSearch: (search: Record<string, unknown>) => parseGrowthSearch(search),
  component: GrowthPage,
});
