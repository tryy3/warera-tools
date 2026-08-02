import type { GrowthBootstrapResponse } from "@/growth/bootstrap";
import { api } from "../api";

export function growthBootstrapPath(userId: string, refresh: boolean): string {
  const qs = new URLSearchParams({ userId });
  if (refresh) qs.set("refresh", "1");
  return `/api/growth/bootstrap?${qs}`;
}

export function fetchGrowthBootstrap(
  userId: string,
  refresh: boolean,
): Promise<GrowthBootstrapResponse> {
  return api<GrowthBootstrapResponse>(growthBootstrapPath(userId, refresh));
}
