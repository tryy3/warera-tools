export type RecentEconomyPlayer = {
  userId: string;
  username: string;
};

export const RECENT_ECONOMY_PLAYERS_KEY = "economyRecentPlayers:v1";
export const RECENT_ECONOMY_PLAYERS_MAX = 5;

function isRecentEconomyPlayer(value: unknown): value is RecentEconomyPlayer {
  if (value == null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && typeof row.username === "string";
}

export function loadRecentEconomyPlayers(): RecentEconomyPlayer[] {
  try {
    const raw = localStorage.getItem(RECENT_ECONOMY_PLAYERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEconomyPlayer);
  } catch {
    return [];
  }
}

export function rememberEconomyPlayer(player: RecentEconomyPlayer): RecentEconomyPlayer[] {
  const next = [
    player,
    ...loadRecentEconomyPlayers().filter((p) => p.userId !== player.userId),
  ].slice(0, RECENT_ECONOMY_PLAYERS_MAX);

  try {
    localStorage.setItem(RECENT_ECONOMY_PLAYERS_KEY, JSON.stringify(next));
  } catch {
    // fail soft — still return next for in-session UI
  }

  return next;
}
