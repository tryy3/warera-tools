export type GrowthSearch = {
  userId?: string;
  username?: string;
};

export function parseGrowthSearch(search: Record<string, unknown>): GrowthSearch {
  const out: GrowthSearch = {};

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

export function buildGrowthSearch(input: {
  userId: string | null;
  username: string | null;
}): GrowthSearch {
  if (!input.userId) return {};
  const out: GrowthSearch = { userId: input.userId };
  if (input.username) out.username = input.username;
  return out;
}
