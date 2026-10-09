import type { ScopedLadder } from "../battle-loot/battle";
import type { LootTallyEntry } from "../battle-loot/ladder";
import type { BattleSideId } from "../warera/battle-ranking";

export type PlayerBattleView = {
  battleId: string;
  regionName: string | null;
  attackerCountryName: string | null;
  defenderCountryName: string | null;
  attackerIsoCode: string | null;
  defenderIsoCode: string | null;
  roundNumber: number | null;
  nextTickAt: string | null;
  /** Null when the user is in no ranking of either side, so both sides' ladders are listed. */
  mySide: BattleSideId | null;
  totalDamage: number | null;
  hits: number | null;
  case1Count: number | null;
  case2Count: number | null;
  ladders: ScopedLadder[];
};

export type PlayerBattlesResponse = {
  userId: string;
  fetchedAt: string;
  /** True when this response was built from live WarEra calls instead of the TTL cache. */
  live: boolean;
  /** False when the active battle list could not be fully walked. */
  battlesComplete: boolean;
  battles: PlayerBattleView[];
  /** Prizes the user holds right now across battles and scopes. */
  held: LootTallyEntry[];
};
