export function spCostForLevel(level: number): number {
  return level >= 1 ? level : 0;
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
