import { createContext, use } from "react";
import type { SelectedPlayer } from "./syncPlayerSearch";

export type PlayerSelectionContextValue = {
  player: SelectedPlayer | null;
  setPlayer: (player: SelectedPlayer | null) => void;
};

export const PlayerSelectionContext = createContext<PlayerSelectionContextValue | null>(null);

export function usePlayerSelection(): PlayerSelectionContextValue {
  const value = use(PlayerSelectionContext);
  if (!value) {
    throw new Error("usePlayerSelection must be used within PlayerSelectionProvider");
  }
  return value;
}
