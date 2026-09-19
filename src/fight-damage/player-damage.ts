import { dmgPerHit, hpLossPerHit } from "./dmg-hit";
import { projectResources } from "./project";
import type { FightKnobs, FightPlayerInput } from "./types";

export const PILL_ATK_BONUS = 0.6;

export function playerDamageNow(input: FightPlayerInput, knobs: FightKnobs): number {
  const resources = projectResources(input, knobs.ticks);
  const hpPerHit = hpLossPerHit(input.armor, input.dodge);
  if (hpPerHit <= 0) return 0;

  // Match Sanna: floor hunger before food conversion, floor hit count.
  const effectiveHpPool =
    resources.hp + Math.floor(resources.hunger) * knobs.foodBonus * input.maxHp;
  const maxHits = Math.floor(effectiveHpPool / hpPerHit);

  return dmgPerHit(input) * maxHits * (1 + knobs.battleBonus);
}

export function withFullResources(input: FightPlayerInput): FightPlayerInput {
  return {
    ...input,
    hp: input.maxHp,
    hunger: input.maxHunger,
  };
}

export function playerDamageFullPill(input: FightPlayerInput, knobs: FightKnobs): number {
  return playerDamageNow(
    withFullResources({
      ...input,
      atk: input.atk * (1 + PILL_ATK_BONUS),
    }),
    knobs,
  );
}

export function playerDamageIfPill(input: FightPlayerInput, knobs: FightKnobs): number {
  if (input.pillStatus !== "ready") {
    return playerDamageNow(input, knobs);
  }

  return playerDamageNow(
    {
      ...input,
      atk: input.atk * (1 + PILL_ATK_BONUS),
    },
    knobs,
  );
}
