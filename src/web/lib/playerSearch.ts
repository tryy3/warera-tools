export type PlayerSearch = {
  userId?: string;
  username?: string;
};

export function parsePlayerSearch(search: Record<string, unknown>): PlayerSearch {
  const out: PlayerSearch = {};
  if (typeof search.userId === "string") {
    const userId = search.userId.trim();
    if (userId) out.userId = userId;
  }
  if (typeof search.username === "string") {
    const username = search.username.trim();
    if (username) out.username = username;
  }
  return out;
}

export function buildPlayerSearch(input: {
  userId: string | null;
  username: string | null;
}): PlayerSearch {
  if (!input.userId) return {};
  const out: PlayerSearch = { userId: input.userId };
  if (input.username) out.username = input.username;
  return out;
}
