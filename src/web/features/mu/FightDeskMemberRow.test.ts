import { describe, expect, it } from "vite-plus/test";
import { playerDamageFullPill, playerDamageNow } from "../../../fight-damage/player-damage";
import type { FightKnobs, FightPlayerInput, PillStatus } from "../../../fight-damage/types";
import {
  buildFightDeskMemberRows,
  sortFightDeskMemberRows,
  type FightDeskSort,
} from "./fightDeskMemberRows";
import type { MuFightDeskMember } from "./types";

const knobs: FightKnobs = {
  foodId: "steak",
  foodBonus: 0.15,
  battleBonus: 0,
  ticks: 2,
};

function fight(userId: string, pillStatus: PillStatus, hp: number, atk = 100): FightPlayerInput {
  return {
    userId,
    atk,
    precision: 1,
    critChance: 0,
    critDamage: 2.66,
    armor: 0,
    dodge: 0,
    hp,
    maxHp: 100,
    hunger: 10,
    maxHunger: 100,
    hpRegenPerHour: 10,
    hungerRegenPerHour: 5,
    pillStatus,
  };
}

function member(
  userId: string,
  username: string,
  pillStatus: PillStatus,
  hp: number,
  peakFight?: FightPlayerInput,
): MuFightDeskMember {
  const current = fight(userId, pillStatus, hp);
  return {
    userId,
    username,
    level: 10,
    role: null,
    incomplete: false,
    fight: current,
    peakFight: peakFight ?? current,
    display: {
      avatarUrl: null,
      militaryRankBonus: 0.25,
      ammoLabel: "Q5",
      pillLabel: "Battle pill",
      pillEndsAt: null,
      skillLevels: { attack: 5 },
    },
  };
}

function sortedIds(sort: FightDeskSort): string[] {
  const rows = buildFightDeskMemberRows(
    [member("ready", "Zulu", "ready", 20), member("active", "Alpha", "active", 80)],
    knobs,
  );
  return sortFightDeskMemberRows(rows, sort).map((row) => row.member.userId);
}

describe("buildFightDeskMemberRows", () => {
  it("derives projected resources and Peak from complete fight data", () => {
    const [row] = buildFightDeskMemberRows([member("ready", "Ready", "ready", 20)], knobs);

    expect(row?.projected).toEqual({ hp: 40, hunger: 20 });
    expect(row?.peakDamage).toBeGreaterThan(row?.nowDamage ?? 0);
    expect(row?.damagePerHit).toBe(100);
  });

  it("projects peakDamage from peakFight Full-pill, not current mid-fight resources", () => {
    const current = fight("ready", "ready", 20);
    const peak = fight("ready", "debuff", 10, 250);
    const [row] = buildFightDeskMemberRows([member("ready", "Ready", "ready", 20, peak)], knobs);

    expect(row?.nowDamage).toBe(playerDamageNow(current, knobs));
    expect(row?.peakDamage).toBe(playerDamageFullPill(peak, knobs));
    expect(row?.peakDamage).toBeGreaterThan(row?.nowDamage ?? 0);
  });
});

describe("sortFightDeskMemberRows", () => {
  it("sorts by total now damage descending by default", () => {
    expect(sortedIds("now")).toEqual(["active", "ready"]);
  });

  it("supports potential, HP, and name sorts", () => {
    expect(sortedIds("potential")).toEqual(["ready", "active"]);
    expect(sortedIds("hp")).toEqual(["active", "ready"]);
    expect(sortedIds("name")).toEqual(["active", "ready"]);
  });

  it("sorts potential by peakDamage from peakFight", () => {
    const lowPeak = member("low", "Low", "ready", 80, fight("low", "ready", 80, 100));
    const highPeak = member("high", "High", "ready", 20, fight("high", "ready", 20, 400));
    const rows = buildFightDeskMemberRows([lowPeak, highPeak], knobs);

    expect(sortFightDeskMemberRows(rows, "potential").map((row) => row.member.userId)).toEqual([
      "high",
      "low",
    ]);
  });

  it("keeps incomplete members at the bottom", () => {
    const incomplete: MuFightDeskMember = {
      ...member("incomplete", "Aardvark", "ready", 100),
      incomplete: true,
      fight: null,
      peakFight: null,
    };
    const rows = buildFightDeskMemberRows(
      [incomplete, member("complete", "Zulu", "ready", 20)],
      knobs,
    );

    expect(sortFightDeskMemberRows(rows, "name").map((row) => row.member.userId)).toEqual([
      "complete",
      "incomplete",
    ]);
  });
});
