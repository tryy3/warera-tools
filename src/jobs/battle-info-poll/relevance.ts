import type { ParsedBattle } from "../../warera/battles";

export type WatchedMu = {
  muId: string;
  countryId: string | null;
};

function sideCountryOrders(battle: ParsedBattle): string[] {
  return [...battle.attacker.countryOrders, ...battle.defender.countryOrders];
}

function sideMuOrders(battle: ParsedBattle): string[] {
  return [...battle.attacker.muOrders, ...battle.defender.muOrders];
}

export function relevantStickyMuIds(battle: ParsedBattle, watched: WatchedMu[]): string[] {
  const muOrderSet = new Set(sideMuOrders(battle));
  const countryOrderSet = new Set(sideCountryOrders(battle));
  const sticky = new Set<string>();

  for (const row of watched) {
    if (muOrderSet.has(row.muId)) sticky.add(row.muId);
    if (row.countryId != null && countryOrderSet.has(row.countryId)) sticky.add(row.muId);
  }

  return [...sticky].toSorted();
}
