export type EcoSkillId = "energy" | "entrepreneurship" | "production" | "companies";

export const ECO_SKILL_IDS: EcoSkillId[] = [
  "energy",
  "entrepreneurship",
  "production",
  "companies",
];

const TABLE: Record<EcoSkillId, { base: number; perLevel: number }> = {
  energy: { base: 30, perLevel: 10 },
  entrepreneurship: { base: 30, perLevel: 5 },
  production: { base: 10, perLevel: 3 },
  companies: { base: 2, perLevel: 1 },
};

export function skillValueFromLevel(skill: EcoSkillId, level: number): number {
  const row = TABLE[skill];
  return row.base + row.perLevel * Math.max(0, level);
}
