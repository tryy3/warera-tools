import type { PlayerBattlesResponse } from "@/player-battles/types";
import { api } from "../api";

export function playerBattlesPath(userId: string, refresh: boolean): string {
  const qs = new URLSearchParams({ userId });
  if (refresh) qs.set("refresh", "1");
  return `/api/player-battles?${qs.toString().replace(/\+/g, "%20")}`;
}

export function fetchPlayerBattles(
  userId: string,
  refresh: boolean,
): Promise<PlayerBattlesResponse> {
  return api<PlayerBattlesResponse>(playerBattlesPath(userId, refresh));
}
