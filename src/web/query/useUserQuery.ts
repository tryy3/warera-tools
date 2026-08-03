import { useQuery } from "@tanstack/react-query";
import { fetchUser } from "./fetchUser";
import { queryKeys } from "./keys";

export function useUserQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.user(userId ?? ""),
    queryFn: () => fetchUser(userId!, false),
    enabled: Boolean(userId),
  });
}
