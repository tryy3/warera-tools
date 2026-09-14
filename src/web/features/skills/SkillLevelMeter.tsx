import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { MAX_ECO_SKILL_LEVEL, maxAffordableLevel } from "@/skills/sp";
import { SkillIcon } from "./SkillIcon";
import { EMPTY_SKILL_BOX_BG, SKILL_VISUALS, type SkillVisualId } from "./skillVisuals";

type SkillLevelMeterProps = {
  skill?: SkillVisualId;
  label?: string;
  color?: string;
  boxBackground?: string;
  icon?: ReactNode;
  level: number;
  freeSp: number;
  maxLevel?: number;
  readOnly?: boolean;
  canUp: boolean;
  canDown: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function SkillLevelMeter({
  skill,
  label,
  color,
  boxBackground,
  icon,
  level,
  freeSp,
  maxLevel = MAX_ECO_SKILL_LEVEL,
  readOnly = false,
  canUp,
  canDown,
  onDecrease,
  onIncrease,
}: SkillLevelMeterProps) {
  const baseVisual = skill ? SKILL_VISUALS[skill] : null;
  const meterLabel = label ?? baseVisual?.label ?? "skill";
  const meterColor = color ?? baseVisual?.color ?? "#cbd5e1";
  const meterBackground =
    boxBackground ?? baseVisual?.boxBackground ?? "linear-gradient(45deg,#475569,#334155)";
  const affordableThru = maxAffordableLevel(level, freeSp, maxLevel);
  const usesProgressBar = maxLevel > 20;
  const slots = usesProgressBar ? [] : Array.from({ length: maxLevel }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-2" style={{ ["--skill-icon" as string]: meterColor }}>
      {usesProgressBar ? (
        <div
          className="relative h-[26px] min-w-0 flex-1 overflow-hidden rounded-[3px]"
          style={{ background: EMPTY_SKILL_BOX_BG }}
          aria-label={`${meterLabel} level ${level} of ${maxLevel}`}
        >
          <div
            className="absolute inset-y-0 left-0 opacity-35"
            style={{ width: `${(affordableThru / maxLevel) * 100}%`, background: meterBackground }}
          />
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${(level / maxLevel) * 100}%`, background: meterBackground }}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-[3px]">
          {slots.map((slotLevel) => {
            const filled = slotLevel <= level;
            if (filled) {
              return (
                <div
                  key={slotLevel}
                  className="grid h-[26px] w-[20px] shrink-0 place-items-center rounded-[3px]"
                  style={{ background: meterBackground }}
                  aria-hidden
                >
                  <div style={{ color: meterColor }} className="grid place-items-center">
                    {icon ?? (skill ? <SkillIcon skill={skill} className="size-4" /> : null)}
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
      )}

      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={!canDown}
            aria-label={`Decrease ${meterLabel}`}
            onClick={onDecrease}
            className="grid size-7 place-items-center rounded-full border border-white/15 bg-[#1a1f2a] text-muted-foreground transition-[border-color,background-color] hover:border-dotted hover:border-white/55 hover:bg-[#232833] disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={!canUp}
            aria-label={`Increase ${meterLabel}`}
            onClick={onIncrease}
            className="grid size-7 place-items-center rounded-full border border-transparent text-[color:var(--skill-icon)] transition-[border-color] hover:border-dotted hover:border-[color:color-mix(in_srgb,var(--skill-icon)_75%,white)] disabled:opacity-40"
            style={{ background: meterBackground }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
