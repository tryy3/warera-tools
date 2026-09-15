import { describe, expect, it } from "vite-plus/test";
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

function fight(userId: string, pillStatus: PillStatus, hp: number): FightPlayerInput {
  return {
    userId,
    atk: 100,
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
): MuFightDeskMember {
  return {
    userId,
    username,
    level: 10,
    role: null,
    incomplete: false,
    fight: fight(userId, pillStatus, hp),
    display: {
      avatarUrl: null,
      militaryRankBonus: 0.25,
      ammoLabel: "Q5",
      pillLabel: "Battle pill",
      pillEndsAt: null,
      skillLevels: { attack: 5 },
      lastSkillsResetAt: null,
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
  it("derives projected resources and pill potential from complete fight data", () => {
    const [row] = buildFightDeskMemberRows([member("ready", "Ready", "ready", 20)], knobs);

    expect(row?.projected).toEqual({ hp: 40, hunger: 20 });
    expect(row?.potentialDamage).toBeGreaterThan(row?.nowDamage ?? 0);
    expect(row?.damagePerHit).toBe(100);
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

  it("keeps incomplete members at the bottom", () => {
    const incomplete: MuFightDeskMember = {
      ...member("incomplete", "Aardvark", "ready", 100),
      incomplete: true,
      fight: null,
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
