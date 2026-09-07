import { Sparkles } from "lucide-react";
import { useState } from "react";
import { calculateDailyIncome, type SkillsLevels } from "@/skills/income";
import { optimizeEcoSkills } from "@/skills/optimize";
import { MAX_ECO_SKILL_LEVEL, totalSpForLevels, totalSpToReachLevel } from "@/skills/sp";
import { ECO_SKILL_IDS, type EcoSkillId } from "@/skills/values";
import { IncomeStack } from "./IncomeStack";
import { SkillRail } from "./SkillRail";
import type { UserResponse } from "./types";

type EconomyTabProps = {
  userData: UserResponse | null;
  userId: string | null;
  username: string | null;
  isFetching: boolean;
  queryError: string | null;
};

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

export function EconomyTab({
  userData,
  userId,
  username,
  isFetching,
  queryError,
}: EconomyTabProps) {
  const user = userData;
  const [levels, setLevels] = useState<SkillsLevels>(() =>
    user
      ? ecoLevelsFromUser(user)
      : { energy: 0, entrepreneurship: 0, production: 0, companies: 0 },
  );
  const [netWage, setNetWage] = useState(() => user?.job.netWage ?? 0);
  const [selfWorkCompanyId, setSelfWorkCompanyId] = useState("");
  /** After full eco reset, draft may use all totalSkillPoints (non-eco treated as 0). */
  const [fullResetDraft, setFullResetDraft] = useState(false);

  const loading = isFetching && !user;

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

  const loadedIncome = user?.income ?? null;

  function setEcoLevel(skill: EcoSkillId, nextLevel: number) {
    const clamped = Math.max(0, Math.min(MAX_ECO_SKILL_LEVEL, Math.round(nextLevel)));
    setLevels((prev) => {
      const next = { ...prev, [skill]: clamped };
      if (totalSpForLevels(next) > ecoPool) return prev;
      return next;
    });
  }

  function handleReset() {
    setLevels({
      energy: 0,
      entrepreneurship: 0,
      production: 0,
      companies: 0,
    });
  }

  function handleRestore() {
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
    <div className="space-y-5">
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

      {username ? (
        <p className="text-sm text-muted-foreground">
          Planning for <strong className="text-foreground">{username}</strong>
          {user ? <span> · character level {user.leveling.level}</span> : null}
        </p>
      ) : null}

      {loading ? <p className="text-muted-foreground">Loading skills…</p> : null}

      {!userId && !loading ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
          Load a player in the header.
        </p>
      ) : null}

      {user && !loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
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
            onRestore={handleRestore}
            onOptimizeUnspent={() => handleOptimize("unspent")}
            onFullOptimize={() => handleOptimize("full_eco_reset")}
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
