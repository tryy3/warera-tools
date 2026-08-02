import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { spCostForLevel, totalSpForLevels, totalSpToReachLevel } from "@/skills/sp";
import { ECO_SKILL_IDS, skillValueFromLevel, type EcoSkillId } from "@/skills/values";
import type { SkillsBootstrapSkill, SkillsLevels } from "./types";
import { formatGold, skillLabel } from "./format";

type SkillRailProps = {
  levels: SkillsLevels;
  loadedSkills: Record<string, SkillsBootstrapSkill>;
  ecoPool: number;
  availableDraft: number;
  spentEco: number;
  totalSkillPoints: number;
  availableSkillPoints: number;
  spentSkillPoints: number;
  onLevelChange: (skill: EcoSkillId, nextLevel: number) => void;
  onReset: () => void;
  onOptimizeUnspent: () => void;
  onFullEcoReset: () => void;
};

export function SkillRail({
  levels,
  loadedSkills,
  ecoPool,
  availableDraft,
  spentEco,
  totalSkillPoints,
  availableSkillPoints,
  spentSkillPoints,
  onLevelChange,
  onReset,
  onOptimizeUnspent,
  onFullEcoReset,
}: SkillRailProps) {
  const otherSkills = Object.entries(loadedSkills)
    .filter(([id]) => !(ECO_SKILL_IDS as string[]).includes(id))
    .toSorted(([a], [b]) => a.localeCompare(b));

  return (
    <aside className="space-y-4 rounded-xl border border-border bg-card/80 p-4">
      <div>
        <h2 className="m-0 text-base font-semibold">Skills</h2>
        <p className="mt-1 mb-0 text-xs text-muted-foreground">
          Draft pool {formatGold(ecoPool, 0)} SP · spent {formatGold(spentEco, 0)} · free{" "}
          {formatGold(availableDraft, 0)}
        </p>
        <p className="mt-1 mb-0 text-xs text-muted-foreground">
          Loaded: {availableSkillPoints} available / {spentSkillPoints} spent / {totalSkillPoints}{" "}
          total
        </p>
      </div>

      <ul className="m-0 list-none space-y-3 p-0">
        {ECO_SKILL_IDS.map((skill) => {
          const level = levels[skill];
          const value = skillValueFromLevel(skill, level);
          const nextCost = spCostForLevel(level + 1);
          const canUp =
            nextCost > 0 && totalSpForLevels({ ...levels, [skill]: level + 1 }) <= ecoPool;
          const canDown = level > 0;
          return (
            <li
              key={skill}
              className="rounded-lg border border-border/80 bg-secondary/20 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{skillLabel(skill)}</div>
                  <div className="text-xs text-muted-foreground">
                    Lv {level} · value {formatGold(value, 0)}
                    {nextCost > 0 ? ` · next ${nextCost} SP` : null}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={!canDown}
                    aria-label={`Decrease ${skillLabel(skill)}`}
                    onClick={() => onLevelChange(skill, level - 1)}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="min-w-8 text-center font-mono text-sm tabular-nums">
                    {level}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={!canUp}
                    aria-label={`Increase ${skillLabel(skill)}`}
                    onClick={() => onLevelChange(skill, level + 1)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="secondary" onClick={onReset}>
          Reset to loaded
        </Button>
        <Button type="button" onClick={onOptimizeUnspent}>
          Optimize unspent
        </Button>
        <Button type="button" variant="outline" onClick={onFullEcoReset}>
          Full eco reset
        </Button>
      </div>

      {otherSkills.length > 0 ? (
        <details className="rounded-lg border border-border/80 bg-secondary/30 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Other skills (read-only)
          </summary>
          <ul className="mt-2 mb-0 list-none space-y-1.5 p-0 text-sm">
            {otherSkills.map(([id, skill]) => (
              <li key={id} className="flex justify-between gap-2 text-muted-foreground">
                <span>{skillLabel(id)}</span>
                <span className="font-mono tabular-nums">
                  Lv {skill.level} · {formatGold(skill.value, 0)} ·{" "}
                  {totalSpToReachLevel(skill.level)} SP
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}
