import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../api";
import { buildPlayerSearch } from "../../lib/playerSearch";
import { usePlayerSelection } from "../../player/player-selection";
import { useSyncPlayerSearch } from "../../player/useSyncPlayerSearch";
import { fetchPlayerBattles } from "../../query/fetchPlayerBattles";
import { queryKeys } from "../../query/keys";
import { usePlayerBattlesQuery } from "../../query/usePlayerBattlesQuery";
import type { FollowPlayersResponse } from "../follow/types";
import { BattleLootCard } from "./BattleLootCard";
import { LootItem } from "./LootItem";

const playerRoute = getRouteApi("/player");

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function PlayerPage() {
  const search = playerRoute.useSearch();
  const navigate = playerRoute.useNavigate();
  const queryClient = useQueryClient();
  const { player } = usePlayerSelection();
  const nowMs = useNow(1000);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useSyncPlayerSearch({
    userId: search.userId,
    username: search.username,
    navigate: (opts) => navigate(opts),
  });

  const followed = useQuery({
    queryKey: queryKeys.followPlayers,
    queryFn: () => api<FollowPlayersResponse>("/api/follow/players"),
  });
  const followedPlayers = followed.data?.players ?? [];

  const userId = search.userId ?? player?.userId ?? null;

  // Default order: URL, then the shell player, then the first followed player.
  const firstFollowed = followedPlayers[0];
  useEffect(() => {
    if (userId != null || !firstFollowed) return;
    void navigate({
      search: buildPlayerSearch({
        userId: firstFollowed.playerId,
        username: firstFollowed.username,
      }),
      replace: true,
    });
  }, [userId, firstFollowed, navigate]);

  const battlesQuery = usePlayerBattlesQuery(userId);
  const data = battlesQuery.data;

  async function onRefresh() {
    if (!userId) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await fetchPlayerBattles(userId, true);
      queryClient.setQueryData(queryKeys.playerBattles(userId), fresh);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  const busy = refreshing || battlesQuery.isFetching;
  const selectedName =
    search.username ??
    (player?.userId === userId ? player.username : undefined) ??
    followedPlayers.find((p) => p.playerId === userId)?.username ??
    userId;

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Player battle loot</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {userId ? (
              <>
                Ongoing battles and prize slots for{" "}
                <span className="font-medium">{selectedName}</span>
              </>
            ) : (
              "Pick a player in the header or a followed player below."
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!userId || busy}
          onClick={() => void onRefresh()}
        >
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
          Refresh
        </Button>
      </header>

      {followedPlayers.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Followed players">
          {followedPlayers.map((p) => (
            <Button
              key={p.playerId}
              type="button"
              size="sm"
              variant={p.playerId === userId ? "default" : "outline"}
              onClick={() =>
                void navigate({
                  search: buildPlayerSearch({ userId: p.playerId, username: p.username }),
                })
              }
            >
              {p.username ?? p.playerId}
            </Button>
          ))}
        </div>
      ) : null}

      {refreshError ? <p className="text-sm text-destructive">{refreshError}</p> : null}
      {battlesQuery.isError ? (
        <p className="text-sm text-destructive">
          {battlesQuery.error instanceof Error ? battlesQuery.error.message : "Load failed"}
        </p>
      ) : null}
      {userId && battlesQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Loading battles…</p>
      ) : null}

      {data ? (
        <>
          {!data.battlesComplete ? (
            <p className="text-sm text-muted-foreground">
              The active battle list could not be fully loaded, some battles may be missing.
            </p>
          ) : null}

          {data.battles.length === 0 ? (
            <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
              {selectedName} has not fought in any ongoing battle.
            </p>
          ) : (
            <>
              <div
                className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-card p-3"
                data-player-held
              >
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Prizes held now
                </span>
                {data.held.length === 0 ? (
                  <span className="text-sm text-muted-foreground">None</span>
                ) : (
                  data.held.map((h) => (
                    <LootItem
                      key={`${h.tier}:${h.kind}`}
                      tier={h.tier}
                      code={h.code}
                      count={h.count}
                    />
                  ))
                )}
              </div>
              {data.battles.map((b) => (
                <BattleLootCard key={b.battleId} battle={b} nowMs={nowMs} />
              ))}
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {data.live ? "Fetched live" : "Cached"} {new Date(data.fetchedAt).toLocaleTimeString()}.
            Rankings move on round ticks only.
          </p>
        </>
      ) : null}
    </section>
  );
}
