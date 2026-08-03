import { getRouteApi } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { calculateDailyIncome, type SkillsLevels } from "@/skills/income";
import { optimizeEcoSkills } from "@/skills/optimize";
import { totalSpForLevels, totalSpToReachLevel } from "@/skills/sp";
import { ECO_SKILL_IDS, type EcoSkillId } from "@/skills/values";
import { buildSkillsSearch } from "../../lib/skillsSearch";
import { usePlayerSelection } from "../../player/PlayerSelectionContext";
import { useSyncPlayerSearch } from "../../player/useSyncPlayerSearch";
import { useUserQuery } from "../../query/useUserQuery";
import { IncomeStack } from "./IncomeStack";
import { SkillRail } from "./SkillRail";
import type { UserResponse } from "./types";

const skillsRoute = getRouteApi("/skills");

function ecoLevelsFromUser(data: UserResponse): SkillsLevels {
  return {
    energy: data.skills.energy?.level ?? 0,
    entrepreneurship: data.skills.entrepreneurship?.level ?? 0,
    production: data.skills.production?.level ?? 0,
    companies: data.skills.companies?.level ?? 0,
  };
}

function spentNonEcoSp(skills: UserResponse["skills"]): number {
  let sum = 0;
  for (const [id, skill] of Object.entries(skills)) {
    if ((ECO_SKILL_IDS as string[]).includes(id)) continue;
    sum += totalSpToReachLevel(skill.level);
  }
  return sum;
}

export function SkillsPage() {
  const search = skillsRoute.useSearch();
  const navigate = skillsRoute.useNavigate();
  const { player } = usePlayerSelection();

  const syncNavigate = useCallback(
    (opts: { search: { userId?: string; username?: string }; replace: boolean }) =>
      navigate({
        search: buildSkillsSearch({
          userId: opts.search.userId ?? null,
          username: opts.search.username ?? null,
        }),
        replace: opts.replace,
      }),
    [navigate],
  );

  useSyncPlayerSearch({
    userId: search.userId,
    username: search.username,
    navigate: syncNavigate,
  });

  const userQuery = useUserQuery(player?.userId ?? null);

  const [user, setUser] = useState<UserResponse | null>(null);
  const appliedKeyRef = useRef<string | null>(null);

  const [levels, setLevels] = useState<SkillsLevels>({
    energy: 0,
    entrepreneurship: 0,
    production: 0,
    companies: 0,
  });
  const [netWage, setNetWage] = useState(0);
  const [selfWorkCompanyId, setSelfWorkCompanyId] = useState("");
  /** After full eco reset, draft may use all totalSkillPoints (non-eco treated as 0). */
  const [fullResetDraft, setFullResetDraft] = useState(false);

  const queryError =
    userQuery.error instanceof Error
      ? userQuery.error.message
      : userQuery.isError
        ? String(userQuery.error)
        : null;

  function applyUser(data: UserResponse) {
    setUser(data);
    setLevels(ecoLevelsFromUser(data));
    setNetWage(data.job.netWage ?? 0);
    setSelfWorkCompanyId("");
    setFullResetDraft(false);
  }

  useEffect(() => {
    const data = userQuery.data;
    const userId = player?.userId;
    if (!data || !userId) {
      if (!userId) {
        setUser(null);
        appliedKeyRef.current = null;
        setFullResetDraft(false);
      } else if (!data) {
        setUser(null);
        appliedKeyRef.current = null;
      }
      return;
    }
    const key = `${userId}:${userQuery.dataUpdatedAt}`;
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    applyUser(data);
  }, [userQuery.data, userQuery.dataUpdatedAt, player?.userId]);

  const loading = userQuery.isFetching && !user;

  const nonEcoSpend = user ? spentNonEcoSp(user.skills) : 0;
  const totalSkillPoints = user?.leveling.totalSkillPoints ?? 0;
  const ecoPool = fullResetDraft ? totalSkillPoints : Math.max(0, totalSkillPoints - nonEcoSpend);
  const spentEco = totalSpForLevels(levels);
  const availableDraft = Math.max(0, ecoPool - spentEco);

  const companies = user?.companies ?? [];

  const income = calculateDailyIncome({
    levels,
    netWage,
    companies,
    selfWorkCompanyId: selfWorkCompanyId || null,
  });

  const loadedIncome =
    user != null
      ? calculateDailyIncome({
          levels: ecoLevelsFromUser(user),
          netWage: user.job.netWage ?? 0,
          companies: user.companies,
          selfWorkCompanyId: null,
        })
      : null;

  function setEcoLevel(skill: EcoSkillId, nextLevel: number) {
    const clamped = Math.max(0, Math.round(nextLevel));
    setLevels((prev) => {
      const next = { ...prev, [skill]: clamped };
      if (totalSpForLevels(next) > ecoPool) return prev;
      return next;
    });
  }

  function handleReset() {
    if (!user) return;
    setLevels(ecoLevelsFromUser(user));
    setNetWage(user.job.netWage ?? 0);
    setSelfWorkCompanyId("");
    setFullResetDraft(false);
  }

  function handleOptimize(mode: "unspent" | "full_eco_reset") {
    if (!user) return;
    const currentLevels = ecoLevelsFromUser(user);
    const result = optimizeEcoSkills({
      mode,
      currentLevels,
      availableSkillPoints: user.leveling.availableSkillPoints,
      totalSkillPoints: user.leveling.totalSkillPoints,
      netWage,
      companies,
      selfWorkCompanyId: selfWorkCompanyId || null,
    });
    setLevels(result.levels);
    setFullResetDraft(mode === "full_eco_reset");
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 50% 80% at 0% 0%, rgba(251,191,36,0.12), transparent 55%), radial-gradient(ellipse 45% 70% at 100% 0%, rgba(45,212,191,0.12), transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            <Sparkles className="size-3.5 text-amber-200" aria-hidden />
            Economy objective
          </p>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Skills optimizer</h1>
          <p className="m-0 max-w-xl text-sm text-muted-foreground">
            Place skill points for work, self-work, and AE daily gold. Draft levels update income
            live; optimize buttons apply a plan (not to the game).
          </p>
        </div>
      </header>

      {queryError ? <p className="text-destructive">{queryError}</p> : null}

      {player ? (
        <p className="text-sm text-muted-foreground">
          Planning for <strong className="text-foreground">{player.username}</strong>
          {user ? <span> · character level {user.leveling.level}</span> : null}
        </p>
      ) : null}

      {loading ? <p className="text-muted-foreground">Loading skills…</p> : null}

      {!player && !loading ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
          Load a player in the header.
        </p>
      ) : null}

      {user && !loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
          <SkillRail
            levels={levels}
            loadedSkills={user.skills}
            ecoPool={ecoPool}
            availableDraft={availableDraft}
            spentEco={spentEco}
            totalSkillPoints={user.leveling.totalSkillPoints}
            availableSkillPoints={user.leveling.availableSkillPoints}
            spentSkillPoints={user.leveling.spentSkillPoints}
            onLevelChange={setEcoLevel}
            onReset={handleReset}
            onOptimizeUnspent={() => handleOptimize("unspent")}
            onFullEcoReset={() => handleOptimize("full_eco_reset")}
          />
          <IncomeStack
            income={income}
            loadedTotal={loadedIncome?.totalGPerDay ?? income.totalGPerDay}
            levels={levels}
            netWage={netWage}
            onNetWageChange={setNetWage}
            job={user.job}
            companies={companies}
            selfWorkCompanyId={selfWorkCompanyId}
            onSelfWorkCompanyChange={setSelfWorkCompanyId}
          />
        </div>
      ) : null}
    </div>
  );
}
