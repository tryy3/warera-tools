export type CompaniesSearch = {
  userId?: string;
  username?: string;
};

export function parseCompaniesSearch(search: Record<string, unknown>): CompaniesSearch {
  const out: CompaniesSearch = {};

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

export function buildCompaniesSearch(input: {
  userId: string | null;
  username: string | null;
}): CompaniesSearch {
  if (!input.userId) return {};
  const out: CompaniesSearch = { userId: input.userId };
  if (input.username) out.username = input.username;
  return out;
}
