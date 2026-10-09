import { createFileRoute } from "@tanstack/react-router";
import { PlayerPage } from "../features/player/PlayerPage";
import { parsePlayerSearch } from "../lib/playerSearch";

export const Route = createFileRoute("/player")({
  validateSearch: (search: Record<string, unknown>) => parsePlayerSearch(search),
  component: PlayerPage,
});
