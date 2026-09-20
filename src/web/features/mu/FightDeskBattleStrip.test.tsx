import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { computeBattleBonus } from "../../../battle-bonus/compute";
import {
  FightDeskBattleStrip,
  formatCompactMuDamage,
  type FightDeskBattleStripProps,
} from "./FightDeskBattleStrip";
import type { MuFightDeskBattle } from "./types";

const creteBonus = computeBattleBonus({
  fightSide: "attacker",
  muCountryId: "sweden",
  attackerCountryId: "greece",
  defenderCountryId: "turkey",
  isRevolt: false,
  countryOrderPriority: "high",
  muOrderPriority: "low",
  hqLevel: 3,
  hqRunning: true,
  allianceWorldShare: null,
  defendingPactPartner: null,
  swornEnemy: null,
  bunkerLevel: null,
  bunkerActive: null,
  militaryBaseLevel: null,
  militaryBaseActive: false,
  resistance: null,
  defenderSupplyLinked: null,
  alliedFortHalf: true,
});

export const creteBattle: MuFightDeskBattle = {
  id: "b-crete",
  regionName: "Crete",
  attackerCountryId: "greece",
  defenderCountryId: "turkey",
  attackerIsoCode: "GR",
  defenderIsoCode: "TR",
  kind: "both",
  muOrderSide: "attacker",
  countryOrderSide: "attacker",
  isRevolt: false,
  muDamageToDate: 12_400_000,
  bonus: creteBonus,
};

function renderStrip(overrides: Partial<FightDeskBattleStripProps> = {}): string {
  const props: FightDeskBattleStripProps = {
    battles: [creteBattle],
    selectedBattleId: creteBattle.id,
    customBonus: 0,
    onSelectBattle: () => undefined,
    onCustomBonusChange: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(<FightDeskBattleStrip {...props} />);
}

describe("formatCompactMuDamage", () => {
  it('formats millions as one decimal M and null as em dash', () => {
    expect(formatCompactMuDamage(12_400_000)).toBe("12.4M");
    expect(formatCompactMuDamage(null)).toBe("—");
  });
});

describe("FightDeskBattleStrip", () => {
  it("renders MU damage and fire % on a live card", () => {
    const html = renderStrip();
    expect(html).toContain("Crete");
    expect(html).toContain("12.4");
    expect(html).toContain(`+${Math.round(creteBonus.total * 100)}%`);
  });

  it("shows MU — when muDamageToDate is null", () => {
    const html = renderStrip({
      battles: [{ ...creteBattle, muDamageToDate: null }],
    });
    expect(html).toContain("MU —");
    expect(html).not.toContain("MU 0");
  });

  it("includes a Custom card", () => {
    const html = renderStrip({ selectedBattleId: "custom" });
    expect(html).toContain("Custom");
  });

  it("highlights the selected live battle card", () => {
    const html = renderStrip({ selectedBattleId: creteBattle.id });
    expect(html).toContain('data-fight-desk-battle-selected="true"');
  });

  it("shows bonus breakdown when a live battle is selected", () => {
    const html = renderStrip({ selectedBattleId: creteBattle.id });
    expect(html).toContain("MU order +5%");
    expect(html).toContain("HQ +15%");
    expect(html).toContain("supply OK");
  });
});
