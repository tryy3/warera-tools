import { useEffect, useRef, useState } from "react";
import { emptyLoadout, type Loadout } from "@/battle-build/slots";
import type { useBattleBuildImportQuery } from "../../query/useBattleBuildImportQuery";
import type { UserResponse } from "../skills/types";
import { LoadoutRow } from "./LoadoutRow";

type BattleTabProps = {
  user: UserResponse | null;
  userId: string | null;
  importQuery: ReturnType<typeof useBattleBuildImportQuery>;
  userError: string | null;
};

const EMPTY_LOADOUT = emptyLoadout();

export function BattleTab({ user, userId, importQuery, userError }: BattleTabProps) {
  const [loadoutState, setLoadoutState] = useState<{
    userId: string | null;
    value: Loadout;
  }>(() => ({ userId: null, value: EMPTY_LOADOUT }));
  const appliedImportKeyRef = useRef<string | null>(null);
  const loadout = loadoutState.userId === userId ? loadoutState.value : EMPTY_LOADOUT;

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
            onChange={(value) => setLoadoutState({ userId, value })}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
            <section className="min-h-64 rounded-xl border border-border bg-card p-4">
              <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                Fight skills
              </p>
              <p className="mt-8 text-sm text-muted-foreground">Skill controls coming soon</p>
            </section>
            <section className="min-h-64 rounded-xl border border-border bg-card p-4">
              <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                Build result
              </p>
              <p className="mt-8 text-sm text-muted-foreground">
                {user ? `Character level ${user.leveling.level}` : "Loading player skills…"}
              </p>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
