export const MAX_ECO_SKILL_LEVEL = 10;

export function spCostForLevel(level: number): number {
  return level >= 1 ? level : 0;
}

export function maxAffordableLevel(
  currentLevel: number,
  freeSp: number,
  maxLevel: number = MAX_ECO_SKILL_LEVEL,
): number {
  let level = Math.max(0, Math.min(maxLevel, Math.floor(currentLevel)));
  let remaining = Math.max(0, freeSp);
  while (level < maxLevel) {
    const cost = spCostForLevel(level + 1);
    if (cost <= 0 || cost > remaining) break;
    remaining -= cost;
    level += 1;
  }
  return level;
}

export function totalSpToReachLevel(level: number): number {
  if (level <= 0) return 0;
  return (level * (level + 1)) / 2;
}

export function totalSpForLevels(levels: Record<string, number>): number {
  let sum = 0;
  for (const level of Object.values(levels)) {
    sum += totalSpToReachLevel(level);
  }
  return sum;
}
