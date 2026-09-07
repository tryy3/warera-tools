import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { emptyFightLevels, updateFightLevel } from "@/battle-build/fight-skills";
import { FightSkillRail } from "./FightSkillRail";
import { ResultPanel } from "./ResultPanel";

describe("updateFightLevel", () => {
  it("accepts an affordable level and rejects one beyond the fight pool", () => {
    const levels = emptyFightLevels();

    expect(updateFightLevel(levels, "attack", 2, 3).attack).toBe(2);
    expect(updateFightLevel(levels, "attack", 2, 2)).toBe(levels);
  });

  it("clamps levels to the combat bounds", () => {
    const levels = emptyFightLevels();

    expect(updateFightLevel(levels, "attack", -4, 0).attack).toBe(0);
    expect(updateFightLevel(levels, "attack", 500, 30_000).attack).toBe(200);
  });
});

describe("FightSkillRail", () => {
  it("renders all fight skills and combat reset controls", () => {
    const html = renderToStaticMarkup(
      <FightSkillRail
        levels={emptyFightLevels()}
        fightPool={0}
        availableDraft={0}
        spentFight={0}
        fullCombatReset={false}
        onLevelChange={() => undefined}
        onReset={() => undefined}
        onRestore={() => undefined}
        onFullCombatReset={() => undefined}
      />,
    );

    expect(html).toContain("Attack");
    expect(html).toContain("Crit. damages");
    expect(html).toContain("Hunger");
    expect(html).toContain("Full combat reset");
    expect(html).toContain("Restore");
    expect(html).toContain("disabled");
  });
});

describe("ResultPanel", () => {
  it("shows the tax-included quote sum and damage placeholder", () => {
    const html = renderToStaticMarkup(
      <ResultPanel totalQuote={14.5} quotedCount={2} quotePending={false} />,
    );

    expect(html).toContain("Tax-included loadout");
    expect(html).toContain("14.5");
    expect(html).toContain("Damage");
    expect(html).toContain("coming later");
    expect(html).not.toContain("daily");
  });
});
