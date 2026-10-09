import type { ScopedLadder } from "@/battle-loot/battle";
import type { UpgradeTarget } from "@/battle-loot/ladder";
import { formatDamage, formatDamageNeeded } from "./lootFormat";
import { LootItem } from "./LootItem";

const SCOPE_LABEL = { round: "Round prizes", battle: "Battle prizes" } as const;

function TargetRow({ target }: { target: UpgradeTarget }) {
  return (
    <li className="flex items-center justify-between gap-3" data-loot-target-rank={target.rank}>
      <span className="flex items-center gap-2">
        <span className="w-8 font-mono text-xs text-muted-foreground">#{target.rank}</span>
        <LootItem tier={target.tier} code={target.code} />
      </span>
      <span className="font-mono text-sm tabular-nums">
        {formatDamageNeeded(target.damageNeeded)}
      </span>
    </li>
  );
}

function Highlight({ title, targets }: { title: string; targets: UpgradeTarget[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      {targets.length === 0 ? (
        <div className="text-sm text-muted-foreground">None</div>
      ) : (
        <ul className="space-y-1">
          {targets.map((t) => (
            <TargetRow key={t.rank} target={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function standing(ladder: ScopedLadder): string {
  const dmg = `${formatDamage(ladder.myDamage)} dmg`;
  return ladder.myRank == null ? `unranked · ${dmg}` : `rank #${ladder.myRank} · ${dmg}`;
}

export function LadderPanel({ ladder, showSide }: { ladder: ScopedLadder; showSide: boolean }) {
  const noSlots = ladder.targets.length === 0;
  return (
    <section
      className="space-y-3 rounded-md border border-border/60 bg-secondary/40 p-3"
      data-ladder-scope={ladder.scope}
      data-ladder-side={ladder.side}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">
          {SCOPE_LABEL[ladder.scope]}
          {showSide ? <span className="ml-2 text-muted-foreground">{ladder.side}</span> : null}
        </h4>
        <span className="font-mono text-xs text-muted-foreground">{standing(ladder)}</span>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Holding</span>
        {ladder.current ? (
          <LootItem tier={ladder.current.tier} code={ladder.current.code} />
        ) : (
          <span className="text-muted-foreground">no prize at this rank</span>
        )}
      </div>

      {noSlots ? (
        <p className="text-sm text-muted-foreground">
          {ladder.myRank === 1 || ladder.current
            ? "No better prize slots above."
            : "No prize slots on this side."}
        </p>
      ) : (
        <>
          <Highlight title="Next tier up" targets={ladder.nextTier ? [ladder.nextTier] : []} />
          {ladder.current ? <Highlight title="Other types" targets={ladder.otherTypes} /> : null}
          <details className="group">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">
              All slots above ({ladder.targets.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {ladder.targets.map((t) => (
                <TargetRow key={t.rank} target={t} />
              ))}
            </ul>
          </details>
        </>
      )}

      {!ladder.rankingComplete ? (
        <p className="text-xs text-muted-foreground">
          Ranking was cut at the page limit, so the user may sit lower than shown.
        </p>
      ) : null}
    </section>
  );
}
