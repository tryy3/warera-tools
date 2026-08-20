import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "../../api";
import { IdSearchField } from "./IdSearchField";
import type {
  FollowPlayersResponse,
  FollowPlayerResponse,
  FollowMusResponse,
  FollowMuResponse,
  MuView,
  PlayerView,
} from "./types";

function reasonLabel(reason: string): string {
  if (reason === "manual") return "manual";
  if (reason === "follow_player") return "follow_player";
  return reason;
}

export function FollowPage() {
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [mus, setMus] = useState<MuView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addPlayerId, setAddPlayerId] = useState("");
  const [addMuId, setAddMuId] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, m] = await Promise.all([
        api<FollowPlayersResponse>("/api/follow/players"),
        api<FollowMusResponse>("/api/follow/mus"),
      ]);
      setPlayers(p.players);
      setMus(m.mus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addPlayer(e: FormEvent) {
    e.preventDefault();
    const playerId = addPlayerId.trim();
    if (!playerId) {
      setError("player id must be a non-empty string");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<FollowPlayerResponse>("/api/follow/players", {
        method: "POST",
        body: JSON.stringify({ playerId }),
      });
      setPlayers((prev) => {
        const without = prev.filter((p) => p.playerId !== data.player.playerId);
        return [...without, data.player];
      });
      setAddPlayerId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(playerId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/follow/players/${encodeURIComponent(playerId)}`, {
        method: "DELETE",
      });
      setPlayers((prev) => prev.filter((p) => p.playerId !== playerId));
      setMus((prev) =>
        prev
          .map((mu) => ({
            ...mu,
            reasons: mu.reasons.filter(
              (r) => !(r.reason === "follow_player" && r.sourceId === playerId),
            ),
          }))
          .filter((mu) => mu.reasons.length > 0),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addMu(e: FormEvent) {
    e.preventDefault();
    const muId = addMuId.trim();
    if (!muId) {
      setError("mu id must be a non-empty string");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<FollowMuResponse>("/api/follow/mus", {
        method: "POST",
        body: JSON.stringify({ muId }),
      });
      setMus((prev) => {
        const without = prev.filter((m) => m.muId !== data.mu.muId);
        return [...without, data.mu];
      });
      setAddMuId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeMu(muId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/follow/mus/${encodeURIComponent(muId)}`, {
        method: "DELETE",
      });
      setMus((prev) =>
        prev
          .map((mu) =>
            mu.muId === muId
              ? {
                  ...mu,
                  reasons: mu.reasons.filter(
                    (r) => !(r.reason === "manual" && r.sourceId === "manual"),
                  ),
                }
              : mu,
          )
          .filter((mu) => mu.reasons.length > 0),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Follow</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading…</p> : null}

      <h2 className="mt-4 mb-2 text-[1.05rem] font-semibold">Players</h2>
      {!loading && players.length === 0 && !error ? (
        <p className="text-muted-foreground">No followed players.</p>
      ) : null}
      {players.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Player ID</TableHead>
              <TableHead>MU ID</TableHead>
              <TableHead>Workplace</TableHead>
              <TableHead>Reasons</TableHead>
              <TableHead>Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((player) => (
              <TableRow key={player.playerId}>
                <TableCell>{player.username ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {player.playerId}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {player.muId ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {player.workplaceCompanyId ?? "—"}
                </TableCell>
                <TableCell>
                  {player.reasons.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="m-0 flex flex-col gap-0.5 p-0 text-sm">
                      {player.reasons.map((r, i) => (
                        <li key={`${r.reason}-${r.sourceId}-${i}`}>{reasonLabel(r.reason)}</li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void removePlayer(player.playerId)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <h3 className="mt-4 mb-2 text-[0.95rem] font-semibold">Add player</h3>
      <form className="flex flex-col gap-2" onSubmit={(e) => void addPlayer(e)}>
        <IdSearchField
          id={addPlayerId}
          onIdChange={setAddPlayerId}
          searchType="user"
          disabled={busy}
        />
        <div>
          <Button type="submit" variant="outline" size="sm" disabled={busy}>
            Add player
          </Button>
        </div>
      </form>

      <h2 className="mt-6 mb-2 text-[1.05rem] font-semibold">MUs</h2>
      {!loading && mus.length === 0 && !error ? (
        <p className="text-muted-foreground">No watched MUs.</p>
      ) : null}
      {mus.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>MU ID</TableHead>
              <TableHead>Reasons</TableHead>
              <TableHead>Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mus.map((mu) => (
              <TableRow key={mu.muId}>
                <TableCell>{mu.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">{mu.muId}</TableCell>
                <TableCell>
                  {mu.reasons.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="m-0 flex flex-col gap-0.5 p-0 text-sm">
                      {mu.reasons.map((r, i) => (
                        <li key={`${r.reason}-${r.sourceId}-${i}`}>
                          {r.reason === "follow_player" ? (
                            <span>
                              follow_player{" "}
                              <span className="text-muted-foreground">
                                (from {r.sourceUsername ?? r.sourceId})
                              </span>
                            </span>
                          ) : (
                            reasonLabel(r.reason)
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell>
                  {mu.reasons.some((r) => r.reason === "manual" && r.sourceId === "manual") ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void removeMu(mu.muId)}
                    >
                      Remove
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">Auto (via player)</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <h3 className="mt-4 mb-2 text-[0.95rem] font-semibold">Add MU</h3>
      <form className="flex flex-col gap-2" onSubmit={(e) => void addMu(e)}>
        <IdSearchField id={addMuId} onIdChange={setAddMuId} searchType="mu" disabled={busy} />
        <div>
          <Button type="submit" variant="outline" size="sm" disabled={busy}>
            Add MU
          </Button>
        </div>
      </form>
    </section>
  );
}
