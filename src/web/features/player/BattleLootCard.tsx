import { useEffect, useState, type ReactNode } from "react";
import type { PlayerBattleView } from "@/player-battles/types";
import { FlagIcon } from "../../components/FlagIcon";
import { formatDamage, formatTickCountdown } from "./lootFormat";
import { LadderPanel } from "./LadderPanel";

function SideName({ name, iso, mine }: { name: string | null; iso: string | null; mine: boolean }) {
  return (
    <span className={mine ? "font-semibold text-foreground" : "text-muted-foreground"}>
      <FlagIcon code={iso} className="mr-1 inline-block h-3.5 align-[-2px]" />
      {name ?? "Unknown"}
    </span>
  );
}

/** Owns the 1s clock so only this value re-renders each second, not the whole ladder tree. */
function TickCountdown({ nextTickAt }: { nextTickAt: string | null }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatTickCountdown(nextTickAt, nowMs)}</>;
}

export function BattleLootCard({ battle }: { battle: PlayerBattleView }) {
  return (
    <article
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      data-player-battle={battle.battleId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{battle.regionName ?? "Battle"}</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <SideName
              name={battle.attackerCountryName}
              iso={battle.attackerIsoCode}
              mine={battle.mySide === "attacker"}
            />
            <span className="text-muted-foreground">vs</span>
            <SideName
              name={battle.defenderCountryName}
              iso={battle.defenderIsoCode}
              mine={battle.mySide === "defender"}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {battle.mySide
              ? `You fight as ${battle.mySide}`
              : "Side unknown, not in any ranking yet"}
            {battle.roundNumber != null ? ` · round ${battle.roundNumber}` : ""}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-xs sm:grid-cols-4">
          <Stat label="Next tick" value={<TickCountdown nextTickAt={battle.nextTickAt} />} />
          <Stat
            label="Battle damage"
            value={battle.totalDamage == null ? "—" : formatDamage(battle.totalDamage)}
          />
          <Stat label="Hits" value={battle.hits == null ? "—" : String(battle.hits)} />
          <Stat
            label="Cases"
            value={`${battle.case1Count ?? 0} / ${battle.case2Count ?? 0}`}
            title="Random case drops per hit, informational only"
          />
        </dl>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {battle.ladders.map((ladder) => (
          <LadderPanel
            key={`${ladder.scope}:${ladder.side}`}
            ladder={ladder}
            showSide={battle.mySide == null}
          />
        ))}
      </div>
    </article>
  );
}

function Stat({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div title={title}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
