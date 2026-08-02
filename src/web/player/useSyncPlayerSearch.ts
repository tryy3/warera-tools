import { useEffect } from "react";
import { usePlayerSelection } from "./PlayerSelectionContext";
import { nextPlayerFromRoute } from "./syncPlayerSearch";

type SyncArgs = {
  userId: string | undefined;
  username: string | undefined;
  navigate: (opts: { search: { userId?: string; username?: string }; replace: boolean }) => unknown;
};

export function useSyncPlayerSearch({ userId, username, navigate }: SyncArgs): void {
  const { player, setPlayer } = usePlayerSelection();

  // Route → shell: hydrate when route params change only (not on every shell pick)
  useEffect(() => {
    const next = nextPlayerFromRoute(userId, username, player);
    if (next === undefined) return;
    setPlayer(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shell is SoT after hydration; re-running on `player` overwrites combobox picks with stale URL params
  }, [userId, username, setPlayer]);

  // Shell → route (shareable URLs while on Companies/Growth only)
  useEffect(() => {
    if (player == null) return;
    if (player.userId === userId && player.username === username) return;
    void navigate({
      search: { userId: player.userId, username: player.username },
      replace: true,
    });
  }, [player, userId, username, navigate]);
}
