import { useQuery } from "@tanstack/react-query";
import { fetchSkillsBootstrap } from "./fetchSkillsBootstrap";
import { queryKeys } from "./keys";

export function useSkillsBootstrapQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.skillsBootstrap(userId ?? ""),
    queryFn: () => fetchSkillsBootstrap(userId!, false),
    enabled: Boolean(userId),
  });
}
