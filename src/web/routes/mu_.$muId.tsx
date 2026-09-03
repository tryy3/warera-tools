import { createFileRoute } from "@tanstack/react-router";
import { MuDetailPage } from "../features/mu/MuDetailPage";
import { parseMuDetailSearch } from "../lib/muSearch";

export const Route = createFileRoute("/mu_/$muId")({
  validateSearch: (search: Record<string, unknown>) => parseMuDetailSearch(search),
  component: MuDetailPage,
});
