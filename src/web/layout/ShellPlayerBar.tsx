import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CompaniesPlayerSearch } from "../features/companies/CompaniesPlayerSearch";
import { usePlayerSelection } from "../player/PlayerSelectionContext";
import { loadPlayerData } from "../query/loadPlayerData";
import { useCompaniesQuery } from "../query/useCompaniesQuery";

export function ShellPlayerBar() {
  const queryClient = useQueryClient();
  const { player, setPlayer } = usePlayerSelection();
  const companiesQuery = useCompaniesQuery(player?.userId ?? null);
  const [loadingAction, setLoadingAction] = useState(false);

  const busy = loadingAction || companiesQuery.isFetching;
  const hasData = companiesQuery.isSuccess;
  const label = hasData ? "Refresh" : "Load";

  async function onLoad() {
    if (!player) return;
    setLoadingAction(true);
    try {
      await loadPlayerData(queryClient, player.userId);
    } finally {
      setLoadingAction(false);
    }
  }

  return (
    <div className="ml-auto flex min-w-0 max-w-xl flex-1 items-center justify-end gap-2">
      <div className="min-w-0 w-56">
        <CompaniesPlayerSearch
          selectedUserId={player?.userId ?? null}
          onSelect={(userId, username) => setPlayer({ userId, username })}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!player || busy}
        onClick={() => void onLoad()}
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
        {busy ? "Loading…" : label}
      </Button>
      <div className="hidden min-w-0 text-xs text-muted-foreground sm:block">
        {!player ? (
          <span>No player</span>
        ) : companiesQuery.isError ? (
          <span className="text-destructive">
            {companiesQuery.error instanceof Error ? companiesQuery.error.message : "Load failed"}
          </span>
        ) : hasData ? (
          <span className="truncate">
            {player.username}
            {companiesQuery.dataUpdatedAt
              ? ` · ${new Date(companiesQuery.dataUpdatedAt).toLocaleString()}`
              : null}
          </span>
        ) : companiesQuery.isFetching ? (
          <span className="truncate">{player.username} · loading…</span>
        ) : (
          <span className="truncate">{player.username} · not loaded</span>
        )}
      </div>
    </div>
  );
}
