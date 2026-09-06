import { useEffect, useRef, useState } from "react";
import {
  emptyFightLevels,
  fightLevelsFromUserSkills,
  spentNonFightSp,
  updateFightLevel,
  type FightLevels,
  type FightSkillId,
} from "@/battle-build/fight-skills";
import { emptyLoadout, type Loadout } from "@/battle-build/slots";
import { totalSpForLevels } from "@/skills/sp";
import type { useBattleBuildImportQuery } from "../../query/useBattleBuildImportQuery";
import type { UserResponse } from "../skills/types";
import { FightSkillRail } from "./FightSkillRail";
import { LoadoutRow } from "./LoadoutRow";
import { ResultPanel } from "./ResultPanel";
import { sumLoadoutQuotes, useLoadoutQuotes } from "./useLoadoutQuotes";

type BattleTabProps = {
  user: UserResponse | null;
  userId: string | null;
  userApplyKey: number;
  importQuery: ReturnType<typeof useBattleBuildImportQuery>;
  userError: string | null;
};

const EMPTY_LOADOUT = emptyLoadout();
const EMPTY_FIGHT_LEVELS = emptyFightLevels();

export function BattleTab({ user, userId, userApplyKey, importQuery, userError }: BattleTabProps) {
  const [loadoutState, setLoadoutState] = useState<{
    userId: string | null;
    value: Loadout;
  }>(() => ({ userId: null, value: EMPTY_LOADOUT }));
  const [fightState, setFightState] = useState<{
    userId: string | null;
    value: FightLevels;
  }>(() => ({ userId: null, value: EMPTY_FIGHT_LEVELS }));
  const [fullCombatReset, setFullCombatReset] = useState(false);
  const appliedImportKeyRef = useRef<string | null>(null);
  const appliedSkillsKeyRef = useRef<string | null>(null);
  const loadout = loadoutState.userId === userId ? loadoutState.value : EMPTY_LOADOUT;
  const fightLevels = fightState.userId === userId ? fightState.value : EMPTY_FIGHT_LEVELS;
  const quoteState = useLoadoutQuotes(loadout);
  const quoteSummary = sumLoadoutQuotes(quoteState.quotes);

  const totalSkillPoints = user?.leveling.totalSkillPoints ?? 0;
  const nonFightSpend = user ? spentNonFightSp(user.skills) : 0;
  const fightPool = fullCombatReset
    ? totalSkillPoints
    : Math.max(0, totalSkillPoints - nonFightSpend);
  const spentFight = totalSpForLevels(fightLevels);
  const availableDraft = Math.max(0, fightPool - spentFight);

  useEffect(() => {
    if (!userId) {
      appliedImportKeyRef.current = null;
      return;
    }
    if (!importQuery.data) return;
    const key = `${userId}:${importQuery.dataUpdatedAt}`;
    if (appliedImportKeyRef.current === key) return;
    appliedImportKeyRef.current = key;
    setLoadoutState({ userId, value: importQuery.data.slots });
  }, [importQuery.data, importQuery.dataUpdatedAt, userId]);

  useEffect(() => {
    if (!userId) {
      appliedSkillsKeyRef.current = null;
      return;
    }
    if (!user) return;
    const key = `${userId}:${userApplyKey}`;
    if (appliedSkillsKeyRef.current === key) return;
    appliedSkillsKeyRef.current = key;
    setFightState({ userId, value: fightLevelsFromUserSkills(user.skills) });
    setFullCombatReset(false);
  }, [user, userApplyKey, userId]);

  function setFightLevel(skill: FightSkillId, nextLevel: number) {
    setFightState((previous) => {
      const current = previous.userId === userId ? previous.value : EMPTY_FIGHT_LEVELS;
      return {
        userId,
        value: updateFightLevel(current, skill, nextLevel, fightPool),
      };
    });
  }

  function restoreFightLevels() {
    if (!user || !userId) return;
    setFightState({ userId, value: fightLevelsFromUserSkills(user.skills) });
    setFullCombatReset(false);
  }

  return (
    <div className="space-y-5" aria-busy={importQuery.isFetching}>
      <header className="rounded-2xl border border-border bg-card px-5 py-5">
        <p className="mb-1 text-xs font-medium tracking-[0.14em] text-primary uppercase">
          Battle objective
        </p>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Battle — loading…</h1>
        <p className="m-0 max-w-xl text-sm text-muted-foreground">
          Build a loadout, tune fight skills, and compare tax-included market prices.
        </p>
      </header>

      {!userId ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
          Load a player in the header.
        </p>
      ) : null}

      {userError ? <p className="text-destructive">{userError}</p> : null}

      {importQuery.isError ? (
        <p className="text-destructive">Current equipment could not be imported.</p>
      ) : null}

      {importQuery.data?.error ? (
        <p className="text-sm text-destructive">{importQuery.data.error}</p>
      ) : null}

      {userId ? (
        <>
          <LoadoutRow
            loadout={loadout}
            importing={importQuery.isFetching && !importQuery.data}
            quoteState={quoteState}
            onChange={(value) => setLoadoutState({ userId, value })}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,420px)_1fr]">
            {user ? (
              <FightSkillRail
                levels={fightLevels}
                fightPool={fightPool}
                availableDraft={availableDraft}
                spentFight={spentFight}
                fullCombatReset={fullCombatReset}
                onLevelChange={setFightLevel}
                onReset={() => setFightState({ userId, value: emptyFightLevels() })}
                onRestore={restoreFightLevels}
                onFullCombatReset={() => setFullCombatReset(true)}
              />
            ) : (
              <section className="min-h-64 rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">Loading player skills…</p>
              </section>
            )}
            <ResultPanel
              totalQuote={quoteSummary.total}
              quotedCount={quoteSummary.quotedCount}
              quotePending={quoteState.pending}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
