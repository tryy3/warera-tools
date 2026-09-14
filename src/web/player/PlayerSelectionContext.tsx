import { useState, type ReactNode } from "react";
import { PlayerSelectionContext } from "./player-selection";
import type { SelectedPlayer } from "./syncPlayerSearch";

export function PlayerSelectionProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  return <PlayerSelectionContext value={{ player, setPlayer }}>{children}</PlayerSelectionContext>;
}
