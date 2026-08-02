import { api } from "../api";
import type { AdvisorResponse } from "../features/companies/types";

export function advisorPath(userId: string, refresh: boolean): string {
  const qs = new URLSearchParams({ userId });
  if (refresh) qs.set("refresh", "1");
  return `/api/economy/advisor?${qs.toString().replace(/\+/g, "%20")}`;
}

export function fetchAdvisor(userId: string, refresh: boolean): Promise<AdvisorResponse> {
  return api<AdvisorResponse>(advisorPath(userId, refresh));
}
