export type SkillsTab = "economy" | "battle";

export type SkillsSearch = {
  userId?: string;
  username?: string;
  tab?: SkillsTab;
};

const SKILLS_TABS = new Set<SkillsTab>(["economy", "battle"]);

function isSkillsTab(value: string): value is SkillsTab {
  return SKILLS_TABS.has(value as SkillsTab);
}

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

  if (typeof search.tab === "string" && isSkillsTab(search.tab)) {
    out.tab = search.tab;
  }

  return out;
}

export function buildSkillsSearch(input: {
  userId: string | null;
  username: string | null;
  tab?: SkillsTab | null;
}): SkillsSearch {
  if (!input.userId) {
    if (input.tab === "battle") return { tab: "battle" };
    return {};
  }
  const out: SkillsSearch = { userId: input.userId };
  if (input.username) out.username = input.username;
  if (input.tab === "battle") out.tab = "battle";
  return out;
}
