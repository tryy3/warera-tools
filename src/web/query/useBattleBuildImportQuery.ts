import type { Loadout } from "@/battle-build/slots";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./keys";

export type BattleBuildImportResponse = {
  slots: Loadout;
  error: string | null;
  recordedAt: string;
};

function battleBuildImportPath(userId: string): string {
  const qs = new URLSearchParams({ userId });
  return `/api/battle-build/import?${qs.toString().replace(/\+/g, "%20")}`;
}

export function useBattleBuildImportQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.battleBuildImport(userId ?? ""),
    queryFn: () => api<BattleBuildImportResponse>(battleBuildImportPath(userId!)),
    enabled: Boolean(userId),
  });
}
