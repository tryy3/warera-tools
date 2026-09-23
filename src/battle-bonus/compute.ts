import {
  FORT_BONUS_MAX,
  FORT_BONUS_PER_LEVEL,
  HQ_BONUS_BY_LEVEL,
  ORDER_BONUS,
  PATRIOTIC_BONUS,
  RAMP_MAX,
  RAMP_PER_DAY,
  RESISTANCE_MAX,
  SUPPLY_LINE_PENALTY,
  allianceBonusFromWorldShare,
} from "./constants";
import type { BattleBonusFacts, BattleBonusResult, BonusPart, RampPartner } from "./types";

function rampBonus(partner: RampPartner | null): { status: BonusPart["status"]; amount: number } {
  if (partner == null) {
    return { status: "off", amount: 0 };
  }
  const amount = Math.min(RAMP_MAX, Math.max(RAMP_PER_DAY, partner.ageDays * RAMP_PER_DAY));
  return { status: "applied", amount };
}

function orderPart(
  id: string,
  label: string,
  priority: BattleBonusFacts["countryOrderPriority"],
): BonusPart {
  if (priority == null) {
    return { id, label, amount: 0, status: "off" };
  }
  return { id, label, amount: ORDER_BONUS[priority], status: "applied" };
}

function patrioticPart(facts: BattleBonusFacts): BonusPart {
  const applies =
    facts.muCountryId === facts.attackerCountryId || facts.muCountryId === facts.defenderCountryId;
  if (!applies) {
    return { id: "patriotic", label: "Patriotic", amount: 0, status: "off" };
  }
  return { id: "patriotic", label: "Patriotic", amount: PATRIOTIC_BONUS, status: "applied" };
}

function alliancePart(facts: BattleBonusFacts): BonusPart {
  if (facts.supportingAllianceMember === false) {
    return { id: "alliance", label: "Alliance", amount: 0, status: "off" };
  }
  if (facts.supportingAllianceMember == null || facts.allianceWorldShare == null) {
    return { id: "alliance", label: "Alliance", amount: null, status: "unknown" };
  }
  return {
    id: "alliance",
    label: "Alliance",
    amount: allianceBonusFromWorldShare(facts.allianceWorldShare),
    status: "applied",
  };
}

function hqPart(facts: BattleBonusFacts): BonusPart {
  if (facts.hqRunning == null) {
    return { id: "hq", label: "HQ", amount: null, status: "unknown" };
  }
  if (!facts.hqRunning) {
    return { id: "hq", label: "HQ", amount: 0, status: "off" };
  }
  const level = facts.hqLevel;
  if (level == null || level < 1 || level > 4) {
    return { id: "hq", label: "HQ", amount: null, status: "unknown" };
  }
  return { id: "hq", label: "HQ", amount: HQ_BONUS_BY_LEVEL[level], status: "applied" };
}

function fortBonus(level: number, halve: boolean): number {
  let amount = Math.min(FORT_BONUS_MAX, level * FORT_BONUS_PER_LEVEL);
  if (halve) {
    amount /= 2;
  }
  return amount;
}

function bunkerPart(facts: BattleBonusFacts): BonusPart {
  if (facts.fightSide !== "defender") {
    return { id: "bunker", label: "Bunker", amount: 0, status: "off" };
  }
  if (facts.bunkerActive == null) {
    return { id: "bunker", label: "Bunker", amount: null, status: "unknown" };
  }
  if (!facts.bunkerActive) {
    return { id: "bunker", label: "Bunker", amount: 0, status: "off" };
  }
  const level = facts.bunkerLevel;
  if (level == null || level < 1) {
    return { id: "bunker", label: "Bunker", amount: null, status: "unknown" };
  }
  return {
    id: "bunker",
    label: "Bunker",
    amount: fortBonus(level, facts.alliedFortHalf),
    status: "applied",
  };
}

function militaryBasePart(facts: BattleBonusFacts): BonusPart {
  if (facts.fightSide !== "attacker") {
    return { id: "military_base", label: "Military base", amount: 0, status: "off" };
  }
  if (facts.militaryBaseActive == null) {
    return {
      id: "military_base",
      label: "Military base",
      amount: null,
      status: "unknown",
    };
  }
  if (!facts.militaryBaseActive) {
    return { id: "military_base", label: "Military base", amount: 0, status: "off" };
  }
  const level = facts.militaryBaseLevel;
  if (level == null || level < 1) {
    return { id: "military_base", label: "Military base", amount: null, status: "unknown" };
  }
  return {
    id: "military_base",
    label: "Military base",
    amount: fortBonus(level, facts.alliedFortHalf),
    status: "applied",
  };
}

function resistancePart(facts: BattleBonusFacts): BonusPart {
  if (!facts.isRevolt || facts.fightSide !== "attacker") {
    return { id: "resistance", label: "Resistance", amount: 0, status: "off" };
  }
  if (facts.resistance == null) {
    return { id: "resistance", label: "Resistance", amount: null, status: "unknown" };
  }
  return {
    id: "resistance",
    label: "Resistance",
    amount: RESISTANCE_MAX * facts.resistance,
    status: "applied",
  };
}

function supplyLinePart(facts: BattleBonusFacts): BonusPart {
  if (facts.fightSide !== "defender") {
    return { id: "supply_line", label: "Supply line", amount: 0, status: "off" };
  }
  if (facts.defenderSupplyLinked === true) {
    return { id: "supply_line", label: "Supply line", amount: 0, status: "off" };
  }
  if (facts.defenderSupplyLinked === false) {
    return {
      id: "supply_line",
      label: "Supply line",
      amount: SUPPLY_LINE_PENALTY,
      status: "applied",
    };
  }
  return { id: "supply_line", label: "Supply line", amount: null, status: "unknown" };
}

function totalFromParts(parts: BonusPart[]): number {
  return parts.reduce((sum, part) => {
    if (part.status !== "applied") {
      return sum;
    }
    return sum + (part.amount ?? 0);
  }, 0);
}

export function computeBattleBonus(facts: BattleBonusFacts): BattleBonusResult {
  const pact = rampBonus(facts.defendingPactPartner);
  const sworn = rampBonus(facts.swornEnemy);

  const parts: BonusPart[] = [
    orderPart("country_order", "Country order", facts.countryOrderPriority),
    orderPart("mu_order", "MU order", facts.muOrderPriority),
    patrioticPart(facts),
    alliancePart(facts),
    {
      id: "defensive_pact",
      label: "Defensive pact",
      amount: pact.amount,
      status: pact.status,
    },
    {
      id: "sworn_enemy",
      label: "Sworn enemy",
      amount: sworn.amount,
      status: sworn.status,
    },
    hqPart(facts),
    bunkerPart(facts),
    militaryBasePart(facts),
    resistancePart(facts),
    supplyLinePart(facts),
  ];

  return { total: totalFromParts(parts), parts };
}

export function customBattleBonus(total: number): BattleBonusResult {
  return {
    total,
    parts: [{ id: "custom", label: "Custom", amount: total, status: "applied" }],
  };
}
