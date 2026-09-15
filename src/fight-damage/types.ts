export type PillStatus = "active" | "debuff" | "ready";

export type FightPlayerInput = {
  userId: string;
  atk: number;
  precision: number;
  critChance: number;
  /**
   * Bonus multiplier portion used by `(1 + critDamage)`.
   * For example, a UI value of 266% is represented as `2.66`.
   */
  critDamage: number;
  armor: number;
  dodge: number;
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  hpRegenPerHour: number;
  hungerRegenPerHour: number;
  pillStatus: PillStatus;
};

export type FightKnobs = {
  foodId: string;
  foodBonus: number;
  battleBonus: number;
  ticks: number;
};
