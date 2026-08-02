export type SkillsSearch = {
  userId?: string;
  username?: string;
};

export function parseSkillsSearch(search: Record<string, unknown>): SkillsSearch {
  const out: SkillsSearch = {};

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

export function buildSkillsSearch(input: {
  userId: string | null;
  username: string | null;
}): SkillsSearch {
  if (!input.userId) return {};
  const out: SkillsSearch = { userId: input.userId };
  if (input.username) out.username = input.username;
  return out;
}
