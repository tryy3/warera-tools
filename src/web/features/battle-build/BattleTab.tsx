import type { useBattleBuildImportQuery } from "../../query/useBattleBuildImportQuery";
import type { UserResponse } from "../skills/types";

type BattleTabProps = {
  user: UserResponse | null;
  userId: string | null;
  importQuery: ReturnType<typeof useBattleBuildImportQuery>;
  userError: string | null;
};

const LOADOUT_SLOTS = ["Weapon", "Helmet", "Chest", "Legs", "Boots", "Ammo", "Food"];

export function BattleTab({ user, userId, importQuery, userError }: BattleTabProps) {
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

      {userId ? (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
                  Current loadout
                </p>
                <h2 className="text-lg font-semibold">Equipment and supplies</h2>
              </div>
              <span className="text-sm text-muted-foreground">
                {importQuery.isFetching ? "Importing…" : "Price total pending"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LOADOUT_SLOTS.map((slot) => (
                <div
                  key={slot}
                  className="min-h-28 rounded-lg border border-dashed border-border bg-background/40 p-3"
                >
                  <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
                    {slot}
                  </p>
                  <p className="mt-5 text-sm text-muted-foreground">Slot controls coming next</p>
                </div>
              ))}
            </div>
          </section>

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
