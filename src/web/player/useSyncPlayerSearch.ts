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

  // Route → shell (deep links only when route carries a userId)
  useEffect(() => {
    const next = nextPlayerFromRoute(userId, username, player);
    if (next === undefined) return;
    setPlayer(next);
  }, [userId, username, player, setPlayer]);

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
