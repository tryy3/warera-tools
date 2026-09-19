import { playerDamageFullPill, playerDamageNow } from "./player-damage";
import type { FightKnobs, FightPlayerInput } from "./types";

export function aggregateFightDesk(
  players: FightPlayerInput[],
  selectedIds: ReadonlySet<string>,
  knobs: FightKnobs,
  peaksByUserId: ReadonlyMap<string, FightPlayerInput> = new Map(),
): {
  now: number;
  peakPotential: number;
  selectedCount: number;
  avgPerMember: number;
  topDamage: number;
  pillCounts: { active: number; debuff: number; ready: number };
} {
  let now = 0;
  let peakPotential = 0;
  let selectedCount = 0;
  let topDamage = 0;
  const pillCounts = { active: 0, debuff: 0, ready: 0 };

  for (const player of players) {
    pillCounts[player.pillStatus] += 1;

    if (!selectedIds.has(player.userId)) {
      continue;
    }

    const playerNow = playerDamageNow(player, knobs);
    const peakInput = peaksByUserId.get(player.userId) ?? player;
    now += playerNow;
    peakPotential += playerDamageFullPill(peakInput, knobs);
    selectedCount += 1;
    topDamage = Math.max(topDamage, playerNow);
  }

  return {
    now,
    peakPotential,
    selectedCount,
    avgPerMember: selectedCount === 0 ? 0 : now / selectedCount,
    topDamage,
    pillCounts,
  };
}
