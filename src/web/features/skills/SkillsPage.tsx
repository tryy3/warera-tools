import { getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { BattleTab } from "../battle-build/BattleTab";
import { buildSkillsSearch } from "../../lib/skillsSearch";
import { usePlayerSelection } from "../../player/PlayerSelectionContext";
import { useSyncPlayerSearch } from "../../player/useSyncPlayerSearch";
import { useBattleBuildImportQuery } from "../../query/useBattleBuildImportQuery";
import { useUserQuery } from "../../query/useUserQuery";
import { EconomyTab } from "./EconomyTab";

const skillsRoute = getRouteApi("/skills");

export function SkillsPage() {
  const search = skillsRoute.useSearch();
  const navigate = skillsRoute.useNavigate();
  const { player } = usePlayerSelection();
  const activeTab = search.tab === "battle" ? "battle" : "economy";

  const syncNavigate = useCallback(
    (opts: { search: { userId?: string; username?: string }; replace: boolean }) =>
      navigate({
        search: buildSkillsSearch({
          userId: opts.search.userId ?? null,
          username: opts.search.username ?? null,
          tab: activeTab,
        }),
        replace: opts.replace,
      }),
    [activeTab, navigate],
  );

  useSyncPlayerSearch({
    userId: search.userId,
    username: search.username,
    navigate: syncNavigate,
  });

  const userId = player?.userId ?? null;
  const userQuery = useUserQuery(userId);
  const importQuery = useBattleBuildImportQuery(activeTab === "battle" ? userId : null);
  const queryError =
    userQuery.error instanceof Error
      ? userQuery.error.message
      : userQuery.isError
        ? String(userQuery.error)
        : null;

  function selectTab(tab: "economy" | "battle") {
    void navigate({
      search: buildSkillsSearch({
        userId,
        username: player?.username ?? null,
        tab,
      }),
    });
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-8">
      <div className="flex border-b border-border" role="tablist" aria-label="Skills planner">
        {(["economy", "battle"] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${tab}-skills-tab`}
              aria-selected={active}
              aria-controls={`${tab}-skills-panel`}
              className={`-mb-px border-t-2 border-b px-5 py-3 text-xs font-semibold tracking-[0.16em] uppercase transition-colors ${
                active
                  ? "border-x border-t-primary border-b-card bg-card text-foreground"
                  : "border-x border-t-transparent border-b-border text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
              onClick={() => selectTab(tab)}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div
        id="economy-skills-panel"
        role="tabpanel"
        aria-labelledby="economy-skills-tab"
        hidden={activeTab !== "economy"}
      >
        <EconomyTab
          key={userId ?? "none"}
          userData={userQuery.data ?? null}
          userId={userId}
          username={player?.username ?? null}
          isFetching={userQuery.isFetching}
          queryError={queryError}
        />
      </div>
      <div
        id="battle-skills-panel"
        role="tabpanel"
        aria-labelledby="battle-skills-tab"
        hidden={activeTab !== "battle"}
      >
        <BattleTab
          user={userQuery.data ?? null}
          userId={userId}
          userApplyKey={userQuery.dataUpdatedAt}
          importQuery={importQuery}
          userError={queryError}
        />
      </div>
    </div>
  );
}
