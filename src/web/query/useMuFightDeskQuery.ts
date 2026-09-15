import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MuFightDeskResponse } from "../features/mu/types";
import { api } from "../api";
import { queryKeys } from "./keys";

const FIGHT_DESK_REFETCH_INTERVAL_MS = 120_000;

function fightDeskPath(muId: string): string {
  return `/api/mu/${encodeURIComponent(muId)}/fight-desk`;
}

export function useMuFightDeskQuery(muId: string) {
  return useQuery({
    queryKey: queryKeys.muFightDesk(muId),
    queryFn: () => api<MuFightDeskResponse>(fightDeskPath(muId)),
    refetchInterval: FIGHT_DESK_REFETCH_INTERVAL_MS,
  });
}

export function useRefreshMuFightDesk(muId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<MuFightDeskResponse>(`${fightDeskPath(muId)}/refresh`, { method: "POST" }),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.muFightDesk(muId), response);
    },
  });
}
