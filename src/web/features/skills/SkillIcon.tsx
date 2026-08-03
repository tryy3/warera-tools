import { SKILL_VISUALS, type SkillVisualId } from "./skillVisuals";

type SkillIconProps = {
  skill: SkillVisualId;
  className?: string;
  /** Slightly stronger shadow like the game client. */
  shadowed?: boolean;
};

export function SkillIcon({ skill, className, shadowed = true }: SkillIconProps) {
  const visual = SKILL_VISUALS[skill];
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={
        shadowed
          ? { filter: "drop-shadow(black 1px 1px 0px)", overflow: "visible" }
          : { overflow: "visible" }
      }
    >
      <path d={visual.path} />
    </svg>
  );
}
