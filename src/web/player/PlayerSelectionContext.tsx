import { createContext, use, useState, type ReactNode } from "react";
import type { SelectedPlayer } from "./syncPlayerSearch";

type PlayerSelectionContextValue = {
  player: SelectedPlayer | null;
  setPlayer: (player: SelectedPlayer | null) => void;
};

const PlayerSelectionContext = createContext<PlayerSelectionContextValue | null>(null);

export function PlayerSelectionProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  return <PlayerSelectionContext value={{ player, setPlayer }}>{children}</PlayerSelectionContext>;
}

export function usePlayerSelection(): PlayerSelectionContextValue {
  const value = use(PlayerSelectionContext);
  if (!value) {
    throw new Error("usePlayerSelection must be used within PlayerSelectionProvider");
  }
  return value;
}
