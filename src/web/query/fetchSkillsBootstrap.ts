import type { SkillsBootstrapResponse } from "@/skills/bootstrap";
import { api } from "../api";

export function skillsBootstrapPath(userId: string, refresh: boolean): string {
  const qs = new URLSearchParams({ userId });
  if (refresh) qs.set("refresh", "1");
  return `/api/skills/bootstrap?${qs.toString().replace(/\+/g, "%20")}`;
}

export function fetchSkillsBootstrap(
  userId: string,
  refresh: boolean,
): Promise<SkillsBootstrapResponse> {
  return api<SkillsBootstrapResponse>(skillsBootstrapPath(userId, refresh));
}
