export type BattleSide = "attacker" | "defender";
export type OrderPriority = "low" | "medium" | "high";

export type BonusPart = {
  id: string;
  label: string;
  amount: number | null;
  status: "applied" | "off" | "unknown";
};

export type BattleBonusResult = {
  total: number;
  parts: BonusPart[];
};

export type RampPartner = {
  ageDays: number;
};

export type BattleBonusFacts = {
  fightSide: BattleSide;
  muCountryId: string;
  attackerCountryId: string;
  defenderCountryId: string;
  isRevolt: boolean;
  countryOrderPriority: OrderPriority | null;
  muOrderPriority: OrderPriority | null;
  hqLevel: number | null;
  hqRunning: boolean | null;
  allianceWorldShare: number | null;
  defendingPactPartner: RampPartner | null;
  swornEnemy: RampPartner | null;
  bunkerLevel: number | null;
  bunkerActive: boolean | null;
  militaryBaseLevel: number | null;
  militaryBaseActive: boolean;
  resistance: number | null;
  defenderSupplyLinked: boolean | null;
  alliedFortHalf: boolean;
};
