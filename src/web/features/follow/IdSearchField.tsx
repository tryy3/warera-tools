import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "../../api";
import type { SearchMusResponse, SearchUsersResponse } from "./types";

type Props = {
  id: string;
  onIdChange: (id: string) => void;
  onPick?: (id: string) => void;
  searchType: "user" | "mu";
  disabled?: boolean;
};

type UserHit = { userId: string; username: string };
type MuHit = { muId: string; name: string };

export function IdSearchField({ id, onIdChange, onPick, searchType, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserHit[]>([]);
  const [mus, setMus] = useState<MuHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const q = query.trim();
  const canSearch = q.length >= 2;
  const displayUsers = canSearch ? users : [];
  const displayMus = canSearch ? mus : [];
  const displayError = canSearch ? error : null;
  const displaySearching = canSearch && searching;

  useEffect(() => {
    if (!canSearch) return;
    const reqId = ++reqIdRef.current;
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          if (searchType === "mu") {
            const data = await api<SearchMusResponse>(
              `/api/economy/search?q=${encodeURIComponent(q)}&type=mu`,
            );
            if (reqId !== reqIdRef.current) return;
            setMus(data.mus);
            setUsers([]);
            setError(null);
            setSearching(false);
          } else {
            const data = await api<SearchUsersResponse>(
              `/api/economy/search?q=${encodeURIComponent(q)}&type=user`,
            );
            if (reqId !== reqIdRef.current) return;
            setUsers(data.users);
            setMus([]);
            setError(null);
            setSearching(false);
          }
        } catch (err) {
          if (reqId !== reqIdRef.current) return;
          setUsers([]);
          setMus([]);
          setError(err instanceof Error ? err.message : String(err));
          setSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [canSearch, q, searchType]);

  function pickUser(hit: UserHit) {
    onIdChange(hit.userId);
    onPick?.(hit.userId);
    setQuery("");
    setUsers([]);
  }

  function pickMu(hit: MuHit) {
    onIdChange(hit.muId);
    onPick?.(hit.muId);
    setQuery("");
    setMus([]);
  }

  const showResults = canSearch;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          {searchType === "mu" ? "MU ID" : "Player ID"}
          <Input
            type="text"
            value={id}
            onChange={(e) => onIdChange(e.target.value)}
            disabled={disabled}
            placeholder={searchType === "mu" ? "Paste MU id" : "Paste player id"}
            aria-label={searchType === "mu" ? "MU id" : "Player id"}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Search by name
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder={searchType === "mu" ? "MU name…" : "Username…"}
            aria-label="Search by name"
            autoComplete="off"
          />
        </label>
      </div>

      {displayError ? <p className="text-sm text-destructive">{displayError}</p> : null}

      {showResults && !displayError ? (
        <div className="rounded-md border border-border bg-card p-2">
          {displaySearching ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : searchType === "mu" ? (
            displayMus.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">No MUs found.</p>
            ) : (
              <ul className="m-0 flex flex-col gap-1 p-0">
                {displayMus.map((hit) => (
                  <li key={hit.muId}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left text-sm hover:bg-primary/10 disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => pickMu(hit)}
                    >
                      <span>{hit.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{hit.muId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : displayUsers.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">No players found.</p>
          ) : (
            <ul className="m-0 flex flex-col gap-1 p-0">
              {displayUsers.map((hit) => (
                <li key={hit.userId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left text-sm hover:bg-primary/10 disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => pickUser(hit)}
                  >
                    <span>{hit.username}</span>
                    <span className="font-mono text-xs text-muted-foreground">{hit.userId}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
