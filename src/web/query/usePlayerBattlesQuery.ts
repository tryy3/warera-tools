import { useQuery } from "@tanstack/react-query";
import { fetchPlayerBattles } from "./fetchPlayerBattles";
import { queryKeys } from "./keys";

/** Server TTL is 60s; polling at the same cadence keeps the ladders near the ~2 min round ticks. */
export const PLAYER_BATTLES_POLL_MS = 60_000;

export function usePlayerBattlesQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.playerBattles(userId ?? ""),
    queryFn: () => fetchPlayerBattles(userId!, false),
    enabled: Boolean(userId),
    refetchInterval: PLAYER_BATTLES_POLL_MS,
  });
}
