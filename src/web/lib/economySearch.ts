export type EconomySearch = {
  userId?: string;
  username?: string;
};

export function parseEconomySearch(search: Record<string, unknown>): EconomySearch {
  const out: EconomySearch = {};

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

export function buildEconomySearch(input: {
  userId: string | null;
  username: string | null;
}): EconomySearch {
  if (!input.userId) return {};
  const out: EconomySearch = { userId: input.userId };
  if (input.username) out.username = input.username;
  return out;
}
