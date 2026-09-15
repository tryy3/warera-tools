import { dmgPerHit } from "../../../fight-damage/dmg-hit";
import { playerDamageIfPill, playerDamageNow } from "../../../fight-damage/player-damage";
import { projectResources } from "../../../fight-damage/project";
import type { FightKnobs } from "../../../fight-damage/types";
import type { MuFightDeskMember } from "./types";

export type FightDeskSort = "now" | "potential" | "hp" | "name";

export type FightDeskMemberRowData = {
  member: MuFightDeskMember;
  nowDamage: number | null;
  potentialDamage: number | null;
  damagePerHit: number | null;
  projected: { hp: number; hunger: number } | null;
};

export function buildFightDeskMemberRows(
  members: MuFightDeskMember[],
  knobs: FightKnobs,
): FightDeskMemberRowData[] {
  return members.map((member) => {
    if (!member.fight || member.incomplete) {
      return {
        member,
        nowDamage: null,
        potentialDamage: null,
        damagePerHit: null,
        projected: null,
      };
    }

    return {
      member,
      nowDamage: playerDamageNow(member.fight, knobs),
      potentialDamage: playerDamageIfPill(member.fight, knobs),
      damagePerHit: dmgPerHit(member.fight),
      projected: projectResources(member.fight, knobs.ticks),
    };
  });
}

export function sortFightDeskMemberRows(
  rows: FightDeskMemberRowData[],
  sort: FightDeskSort,
): FightDeskMemberRowData[] {
  return rows.toSorted((a, b) => {
    const aComplete = a.nowDamage != null;
    const bComplete = b.nowDamage != null;
    if (aComplete !== bComplete) return aComplete ? -1 : 1;

    switch (sort) {
      case "potential":
        return (b.potentialDamage ?? -1) - (a.potentialDamage ?? -1);
      case "hp":
        return (b.projected?.hp ?? -1) - (a.projected?.hp ?? -1);
      case "name":
        return (a.member.username ?? a.member.userId).localeCompare(
          b.member.username ?? b.member.userId,
        );
      case "now":
        return (b.nowDamage ?? -1) - (a.nowDamage ?? -1);
    }
  });
}
