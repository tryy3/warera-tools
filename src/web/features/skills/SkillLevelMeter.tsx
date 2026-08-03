import { Minus, Plus } from "lucide-react";
import { MAX_ECO_SKILL_LEVEL, maxAffordableLevel } from "@/skills/sp";
import { SkillIcon } from "./SkillIcon";
import { EMPTY_SKILL_BOX_BG, SKILL_VISUALS, type SkillVisualId } from "./skillVisuals";

type SkillLevelMeterProps = {
  skill: SkillVisualId;
  level: number;
  freeSp: number;
  readOnly?: boolean;
  canUp: boolean;
  canDown: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function SkillLevelMeter({
  skill,
  level,
  freeSp,
  readOnly = false,
  canUp,
  canDown,
  onDecrease,
  onIncrease,
}: SkillLevelMeterProps) {
  const visual = SKILL_VISUALS[skill];
  const affordableThru = maxAffordableLevel(level, freeSp);
  const slots = Array.from({ length: MAX_ECO_SKILL_LEVEL }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-2" style={{ ["--skill-icon" as string]: visual.color }}>
      <div className="flex min-w-0 flex-1 items-center gap-[3px]">
        {slots.map((slotLevel) => {
          const filled = slotLevel <= level;
          if (filled) {
            return (
              <div
                key={slotLevel}
                className="grid h-[26px] w-[20px] shrink-0 place-items-center rounded-[3px]"
                style={{ background: visual.boxBackground }}
                aria-hidden
              >
                <div style={{ color: visual.color }} className="grid place-items-center">
                  <SkillIcon skill={skill} className="size-4" />
                </div>
              </div>
            );
          }
          const affordable = slotLevel <= affordableThru;
          return (
            <div
              key={slotLevel}
              className="h-[26px] w-[20px] shrink-0 rounded-[3px]"
              style={{
                background: EMPTY_SKILL_BOX_BG,
                opacity: affordable ? 1 : 0.2,
              }}
              aria-hidden
            />
          );
        })}
      </div>

      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={!canDown}
            aria-label={`Decrease ${visual.label}`}
            onClick={onDecrease}
            className="grid size-7 place-items-center rounded-full border border-white/15 bg-[#1a1f2a] text-muted-foreground transition-[border-color,background-color] hover:border-dotted hover:border-white/55 hover:bg-[#232833] disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={!canUp}
            aria-label={`Increase ${visual.label}`}
            onClick={onIncrease}
            className="grid size-7 place-items-center rounded-full border border-transparent text-[color:var(--skill-icon)] transition-[border-color] hover:border-dotted hover:border-[color:color-mix(in_srgb,var(--skill-icon)_75%,white)] disabled:opacity-40"
            style={{ background: visual.boxBackground }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
