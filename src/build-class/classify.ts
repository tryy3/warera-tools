import { FIGHT_SKILL_IDS, fightLevelsFromUserSkills } from "../battle-build/fight-skills";
import { totalSpToReachLevel } from "../skills/sp";
import { ECO_SKILL_IDS } from "../skills/values";

export type BuildClass = "eco" | "war" | "unknown";

export function classifyBuildFromSkillLevels(
  skills: Record<string, { level: number }>,
): BuildClass {
  let ecoSp = 0;
  for (const id of ECO_SKILL_IDS) {
    const level = skills[id]?.level;
    if (typeof level === "number" && Number.isFinite(level)) {
      ecoSp += totalSpToReachLevel(Math.max(0, Math.floor(level)));
    }
  }

  const fight = fightLevelsFromUserSkills(skills);
  let warSp = 0;
  for (const id of FIGHT_SKILL_IDS) {
    warSp += totalSpToReachLevel(fight[id]);
  }

  if (ecoSp === 0 && warSp === 0) return "unknown";
  if (ecoSp > warSp) return "eco";
  return "war";
}
