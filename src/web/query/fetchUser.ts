import type { UserResponse } from "@/user";
import { api } from "../api";

export function userPath(userId: string, refresh: boolean): string {
  const qs = new URLSearchParams({ userId });
  if (refresh) qs.set("refresh", "1");
  return `/api/user?${qs.toString().replace(/\+/g, "%20")}`;
}

export function fetchUser(userId: string, refresh: boolean): Promise<UserResponse> {
  return api<UserResponse>(userPath(userId, refresh));
}
