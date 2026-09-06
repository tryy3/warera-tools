import { totalSpForLevels, totalSpToReachLevel } from "../skills/sp";

export type FightSkillId =
  | "attack"
  | "precision"
  | "criticalChance"
  | "criticalDamages"
  | "armor"
  | "dodge"
  | "health"
  | "lootChance"
  | "hunger";

export const FIGHT_SKILL_IDS: FightSkillId[] = [
  "attack",
  "precision",
  "criticalChance",
  "criticalDamages",
  "armor",
  "dodge",
  "health",
  "lootChance",
  "hunger",
];

export const FIGHT_SKILL_LABELS: Record<FightSkillId, string> = {
  attack: "Attack",
  precision: "Precision",
  criticalChance: "Crit. chance",
  criticalDamages: "Crit. damages",
  armor: "Armor",
  dodge: "Dodge",
  health: "Health",
  lootChance: "Loot chance",
  hunger: "Hunger",
};

export const MAX_FIGHT_SKILL_LEVEL = 200;

export type FightLevels = Record<FightSkillId, number>;

export function emptyFightLevels(): FightLevels {
  return {
    attack: 0,
    precision: 0,
    criticalChance: 0,
    criticalDamages: 0,
    armor: 0,
    dodge: 0,
    health: 0,
    lootChance: 0,
    hunger: 0,
  };
}

export function fightLevelsFromUserSkills(skills: Record<string, { level: number }>): FightLevels {
  const out = emptyFightLevels();
  for (const id of FIGHT_SKILL_IDS) {
    const level = skills[id]?.level;
    if (typeof level === "number" && Number.isFinite(level)) {
      out[id] = Math.max(0, Math.floor(level));
    }
  }
  return out;
}

export function spentNonFightSp(skills: Record<string, { level: number }>): number {
  const fight = new Set<string>(FIGHT_SKILL_IDS);
  let sum = 0;
  for (const [id, skill] of Object.entries(skills)) {
    if (fight.has(id)) continue;
    sum += totalSpToReachLevel(skill.level);
  }
  return sum;
}

export function updateFightLevel(
  levels: FightLevels,
  skill: FightSkillId,
  nextLevel: number,
  fightPool: number,
): FightLevels {
  const clamped = Math.max(0, Math.min(MAX_FIGHT_SKILL_LEVEL, Math.round(nextLevel)));
  const next = { ...levels, [skill]: clamped };
  return totalSpForLevels(next) <= fightPool ? next : levels;
}
