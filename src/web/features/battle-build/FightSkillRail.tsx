import { RotateCcw, Swords } from "lucide-react";
import {
  FIGHT_SKILL_IDS,
  FIGHT_SKILL_LABELS,
  MAX_FIGHT_SKILL_LEVEL,
  type FightLevels,
  type FightSkillId,
} from "@/battle-build/fight-skills";
import { Button } from "@/components/ui/button";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { spCostForLevel, totalSpForLevels } from "@/skills/sp";
import { SkillLevelMeter } from "../skills/SkillLevelMeter";

type FightSkillRailProps = {
  levels: FightLevels;
  fightPool: number;
  availableDraft: number;
  spentFight: number;
  fullCombatReset: boolean;
  onLevelChange: (skill: FightSkillId, nextLevel: number) => void;
  onReset: () => void;
  onRestore: () => void;
  onFullCombatReset: () => void;
};

export function FightSkillRail({
  levels,
  fightPool,
  availableDraft,
  spentFight,
  fullCombatReset,
  onLevelChange,
  onReset,
  onRestore,
  onFullCombatReset,
}: FightSkillRailProps) {
  return (
    <aside className="space-y-5 rounded-xl border border-border bg-card/80 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="mb-1 inline-flex items-center gap-1.5 text-xs tracking-[0.14em] text-muted-foreground uppercase">
            <Swords className="size-3.5 text-amber-200" aria-hidden />
            Fight skills
          </p>
          <h2 className="m-0 text-lg font-semibold">Combat skill points</h2>
          <p className="mt-1 mb-0 text-xs text-muted-foreground">
            Draft pool {formatDisplayNumber(fightPool)} SP · spent {formatDisplayNumber(spentFight)}{" "}
            · free {formatDisplayNumber(availableDraft)}
          </p>
          {fullCombatReset ? (
            <p className="mt-1 mb-0 text-xs text-amber-200">
              Full combat reset: non-fight spend is available.
            </p>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="xs" onClick={onReset}>
          Reset
        </Button>
      </div>

      <ul className="m-0 list-none space-y-3 p-0">
        {FIGHT_SKILL_IDS.map((skillId) => {
          const level = levels[skillId];
          const nextCost = spCostForLevel(level + 1);
          const canUp =
            level < MAX_FIGHT_SKILL_LEVEL &&
            totalSpForLevels({ ...levels, [skillId]: level + 1 }) <= fightPool;

          return (
            <li
              key={skillId}
              className="rounded-xl border border-border/80 bg-secondary/20 px-4 py-3.5"
            >
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="text-[0.95rem] font-medium">{FIGHT_SKILL_LABELS[skillId]}</span>
                <span className="text-xs text-muted-foreground">
                  Lv {level}
                  {level < MAX_FIGHT_SKILL_LEVEL ? ` · next ${nextCost} SP` : null}
                </span>
              </div>
              <SkillLevelMeter
                label={FIGHT_SKILL_LABELS[skillId]}
                level={level}
                freeSp={availableDraft}
                maxLevel={MAX_FIGHT_SKILL_LEVEL}
                canUp={canUp}
                canDown={level > 0}
                onDecrease={() => onLevelChange(skillId, level - 1)}
                onIncrease={() => onLevelChange(skillId, level + 1)}
              />
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="lg"
          className="h-10 gap-1.5"
          variant={fullCombatReset ? "default" : "secondary"}
          onClick={onFullCombatReset}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Full combat reset
        </Button>
        <Button type="button" size="lg" className="h-10" variant="outline" onClick={onRestore}>
          Restore
        </Button>
      </div>
    </aside>
  );
}
