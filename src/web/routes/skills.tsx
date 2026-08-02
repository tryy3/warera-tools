import { createFileRoute } from "@tanstack/react-router";
import { SkillsPage } from "../features/skills/SkillsPage";
import { parseSkillsSearch } from "../lib/skillsSearch";

export const Route = createFileRoute("/skills")({
  validateSearch: (search: Record<string, unknown>) => parseSkillsSearch(search),
  component: SkillsPage,
});
