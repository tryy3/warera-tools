export const SKILLS_RESET_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type SkillsResetStatus =
  | { kind: "available" }
  | { kind: "cooldown"; endsAt: Date; remainingMs: number };

export function skillsResetStatus(
  lastSkillsResetAt: Date | null,
  now: Date = new Date(),
): SkillsResetStatus {
  if (lastSkillsResetAt == null) {
    return { kind: "available" };
  }

  const endsAt = new Date(lastSkillsResetAt.getTime() + SKILLS_RESET_COOLDOWN_MS);

  if (now >= endsAt) {
    return { kind: "available" };
  }

  return {
    kind: "cooldown",
    endsAt,
    remainingMs: endsAt.getTime() - now.getTime(),
  };
}
