import { Coins, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_ECO_SKILL_LEVEL,
  spCostForLevel,
  totalSpForLevels,
  totalSpToReachLevel,
} from "@/skills/sp";
import { ECO_SKILL_IDS, skillValueFromLevel, type EcoSkillId } from "@/skills/values";
import type { SkillsLevels, UserSkill } from "./types";
import { formatGold, skillLabel } from "./format";
import { SkillIcon } from "./SkillIcon";
import { SkillLevelMeter } from "./SkillLevelMeter";
import { SKILL_PANEL_ORDER, SKILL_VISUALS, type SkillVisualId } from "./skillVisuals";

type SkillRailProps = {
  levels: SkillsLevels;
  loadedSkills: Record<string, UserSkill>;
  ecoPool: number;
  availableDraft: number;
  spentEco: number;
  totalSkillPoints: number;
  availableSkillPoints: number;
  spentSkillPoints: number;
  onLevelChange: (skill: EcoSkillId, nextLevel: number) => void;
  onReset: () => void;
  onRestore: () => void;
  onOptimizeUnspent: () => void;
  onFullOptimize: () => void;
};

function isEcoSkill(id: SkillVisualId): id is EcoSkillId {
  return (ECO_SKILL_IDS as string[]).includes(id);
}

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
  onRestore,
  onOptimizeUnspent,
  onFullOptimize,
}: SkillRailProps) {
  const otherSkills = Object.entries(loadedSkills)
    .filter(([id]) => !(ECO_SKILL_IDS as string[]).includes(id) && id !== "management")
    .toSorted(([a], [b]) => a.localeCompare(b));

  return (
    <aside className="space-y-4 rounded-xl border border-border bg-card/80 p-4">
      <div className="flex items-start justify-between gap-2">
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
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>

      <ul className="m-0 list-none space-y-2.5 p-0">
        {SKILL_PANEL_ORDER.map((skillId) => {
          const visual = SKILL_VISUALS[skillId];
          const eco = isEcoSkill(skillId);
          const level = eco ? levels[skillId] : (loadedSkills.management?.level ?? 0);
          const value = eco
            ? skillValueFromLevel(skillId, level)
            : (loadedSkills.management?.value ?? 0);
          const nextCost = eco ? spCostForLevel(level + 1) : 0;
          const canUp =
            eco &&
            level < MAX_ECO_SKILL_LEVEL &&
            nextCost > 0 &&
            totalSpForLevels({ ...levels, [skillId]: level + 1 }) <= ecoPool;
          const canDown = eco && level > 0;

          return (
            <li
              key={skillId}
              className={`rounded-lg border border-border/80 bg-secondary/20 px-3 py-2.5 ${eco ? "" : "opacity-80"}`}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <div
                  className="grid size-9 shrink-0 place-items-center rounded-lg"
                  style={{ background: visual.boxBackground, color: visual.color }}
                >
                  <SkillIcon skill={skillId} className="size-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{visual.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {eco ? (
                      <>
                        Lv {level} · value {formatGold(value, 0)}
                        {level < MAX_ECO_SKILL_LEVEL && nextCost > 0
                          ? ` · next ${nextCost} SP`
                          : null}
                      </>
                    ) : (
                      <>read-only · Lv {level}</>
                    )}
                  </div>
                </div>
              </div>
              <SkillLevelMeter
                skill={skillId}
                level={level}
                freeSp={eco ? availableDraft : 0}
                readOnly={!eco}
                canUp={canUp}
                canDown={canDown}
                onDecrease={() => onLevelChange(skillId as EcoSkillId, level - 1)}
                onIncrease={() => onLevelChange(skillId as EcoSkillId, level + 1)}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="gap-1.5" onClick={onFullOptimize}>
            <Sparkles className="size-3.5" aria-hidden />
            Full Optimize
          </Button>
          <Button type="button" variant="secondary" className="gap-1.5" onClick={onOptimizeUnspent}>
            <Coins className="size-3.5" aria-hidden />
            Optimize unspent
          </Button>
        </div>
        <button
          type="button"
          className="text-center text-xs text-primary underline-offset-2 hover:underline"
          onClick={onRestore}
        >
          Restore
        </button>
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
