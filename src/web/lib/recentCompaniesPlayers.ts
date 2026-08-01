export type RecentCompaniesPlayer = {
  userId: string;
  username: string;
};

export const RECENT_COMPANIES_PLAYERS_KEY = "companiesRecentPlayers:v1";
export const LEGACY_RECENT_ECONOMY_PLAYERS_KEY = "economyRecentPlayers:v1";
export const RECENT_COMPANIES_PLAYERS_MAX = 5;

function isRecentCompaniesPlayer(value: unknown): value is RecentCompaniesPlayer {
  if (value == null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && typeof row.username === "string";
}

function parseRecentPlayers(raw: string | null): RecentCompaniesPlayer[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentCompaniesPlayer);
  } catch {
    return [];
  }
}

export function loadRecentCompaniesPlayers(): RecentCompaniesPlayer[] {
  try {
    const current = parseRecentPlayers(localStorage.getItem(RECENT_COMPANIES_PLAYERS_KEY));
    if (current.length > 0) return current;

    const legacy = parseRecentPlayers(localStorage.getItem(LEGACY_RECENT_ECONOMY_PLAYERS_KEY));
    if (legacy.length === 0) return [];

    try {
      localStorage.setItem(RECENT_COMPANIES_PLAYERS_KEY, JSON.stringify(legacy));
    } catch {
      // fail soft — still return migrated list for in-session UI
    }
    return legacy;
  } catch {
    return [];
  }
}

export function rememberCompaniesPlayer(player: RecentCompaniesPlayer): RecentCompaniesPlayer[] {
  const next = [
    player,
    ...loadRecentCompaniesPlayers().filter((p) => p.userId !== player.userId),
  ].slice(0, RECENT_COMPANIES_PLAYERS_MAX);

  try {
    localStorage.setItem(RECENT_COMPANIES_PLAYERS_KEY, JSON.stringify(next));
  } catch {
    // fail soft — still return next for in-session UI
  }

  return next;
}
