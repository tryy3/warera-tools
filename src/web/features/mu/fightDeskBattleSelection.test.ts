import { describe, expect, it } from "vite-plus/test";
import { resolveFightDeskBattleSelection } from "./fightDeskBattleSelection";
import type { MuFightDeskBattle } from "./types";

function battle(
  overrides: Pick<MuFightDeskBattle, "id"> & Partial<MuFightDeskBattle>,
): MuFightDeskBattle {
  return {
    regionName: "Crete",
    attackerCountryId: "greece",
    defenderCountryId: "turkey",
    attackerIsoCode: "GR",
    defenderIsoCode: "TR",
    kind: "mu_order",
    muOrderSide: "attacker",
    countryOrderSide: null,
    isRevolt: false,
    muDamageToDate: 1000,
    bonus: { total: 0.2, parts: [] },
    ...overrides,
  };
}

const crete = battle({ id: "b-crete", kind: "both", bonus: { total: 0.35, parts: [] } });
const countryOrder = battle({
  id: "b-country",
  kind: "country_order",
  bonus: { total: 0.1, parts: [] },
});

describe("resolveFightDeskBattleSelection", () => {
  it("keeps a stored live id while battles are pending", () => {
    const result = resolveFightDeskBattleSelection({
      battlesLoaded: false,
      battles: [],
      previousBattles: [],
      selectedBattleId: crete.id,
      battleBonus: 0,
      applyInitialPreset: false,
      autoSelectConsumed: true,
    });

    expect(result.selectedBattleId).toBe(crete.id);
    expect(result.battleBonus).toBe(0);
  });

  it("falls back to custom and copies the vanished row bonus when previous list has it", () => {
    const result = resolveFightDeskBattleSelection({
      battlesLoaded: true,
      battles: [countryOrder],
      previousBattles: [crete],
      selectedBattleId: crete.id,
      battleBonus: 0,
      applyInitialPreset: false,
      autoSelectConsumed: true,
    });

    expect(result.selectedBattleId).toBe("custom");
    expect(result.battleBonus).toBe(0.35);
  });

  it("falls back to custom and keeps stored Custom % when no previous row exists", () => {
    const result = resolveFightDeskBattleSelection({
      battlesLoaded: true,
      battles: [countryOrder],
      previousBattles: [],
      selectedBattleId: "gone",
      battleBonus: 0.12,
      applyInitialPreset: false,
      autoSelectConsumed: true,
    });

    expect(result.selectedBattleId).toBe("custom");
    expect(result.battleBonus).toBe(0.12);
  });

  it("picks the first non-country-order battle on first visit", () => {
    const result = resolveFightDeskBattleSelection({
      battlesLoaded: true,
      battles: [countryOrder, crete],
      previousBattles: [],
      selectedBattleId: "custom",
      battleBonus: 0,
      applyInitialPreset: true,
      autoSelectConsumed: false,
    });

    expect(result.selectedBattleId).toBe(crete.id);
    expect(result.autoSelectConsumed).toBe(true);
  });

  it("stays on custom after auto-select is consumed even if MU battles exist", () => {
    const result = resolveFightDeskBattleSelection({
      battlesLoaded: true,
      battles: [crete],
      previousBattles: [crete],
      selectedBattleId: "custom",
      battleBonus: 0,
      applyInitialPreset: true,
      autoSelectConsumed: true,
    });

    expect(result.selectedBattleId).toBe("custom");
    expect(result.battleBonus).toBe(0);
  });

  it("keeps a live pick present in the loaded list", () => {
    const result = resolveFightDeskBattleSelection({
      battlesLoaded: true,
      battles: [crete],
      previousBattles: [crete],
      selectedBattleId: crete.id,
      battleBonus: 0,
      applyInitialPreset: false,
      autoSelectConsumed: true,
    });

    expect(result.selectedBattleId).toBe(crete.id);
  });
});
