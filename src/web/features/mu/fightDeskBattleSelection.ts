import type { MuFightDeskBattle } from "./types";

export type FightDeskBattleSelectionInput = {
  battlesLoaded: boolean;
  battles: MuFightDeskBattle[];
  previousBattles: MuFightDeskBattle[];
  selectedBattleId: string | "custom";
  battleBonus: number;
  applyInitialPreset: boolean;
  autoSelectConsumed: boolean;
};

export type FightDeskBattleSelectionResult = {
  selectedBattleId: string | "custom";
  battleBonus: number;
  autoSelectConsumed: boolean;
};

export function resolveFightDeskBattleSelection(
  input: FightDeskBattleSelectionInput,
): FightDeskBattleSelectionResult {
  const {
    battlesLoaded,
    battles,
    previousBattles,
    selectedBattleId,
    battleBonus,
    applyInitialPreset,
    autoSelectConsumed,
  } = input;

  if (!battlesLoaded) {
    return { selectedBattleId, battleBonus, autoSelectConsumed };
  }

  let nextId = selectedBattleId;
  let nextBonus = battleBonus;

  if (nextId !== "custom" && !battles.some((row) => row.id === nextId)) {
    const vanished = previousBattles.find((row) => row.id === nextId);
    nextId = "custom";
    if (vanished) nextBonus = vanished.bonus.total;
  }

  let nextConsumed = autoSelectConsumed;
  if (applyInitialPreset && !autoSelectConsumed) {
    nextConsumed = true;
    if (nextId === "custom") {
      const pick = battles.find((row) => row.kind !== "country_order");
      if (pick) nextId = pick.id;
    }
  }

  return {
    selectedBattleId: nextId,
    battleBonus: nextBonus,
    autoSelectConsumed: nextConsumed,
  };
}
