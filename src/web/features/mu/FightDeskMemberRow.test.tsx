import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { FightKnobs, FightPlayerInput, PillStatus } from "../../../fight-damage/types";
import { formatDisplayNumber } from "../../../lib/formatDisplayNumber";
import { FightDeskMemberRow } from "./FightDeskMemberRow";
import { buildFightDeskMemberRows } from "./fightDeskMemberRows";
import type { MuFightDeskMember } from "./types";

const knobs: FightKnobs = {
  foodId: "steak",
  foodBonus: 0.15,
  battleBonus: 0,
  ticks: 2,
};

const nowMs = Date.parse("2026-09-19T12:00:00.000Z");

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
  pillEndsAt: string | null = null,
): MuFightDeskMember {
  const current = fight(userId, pillStatus, hp);
  return {
    userId,
    username,
    level: 10,
    role: null,
    incomplete: false,
    fight: current,
    peakFight: current,
    display: {
      avatarUrl: null,
      militaryRankBonus: 0.25,
      ammoLabel: "Q5",
      pillLabel: "Battle pill",
      pillEndsAt,
      skillLevels: { attack: 5 },
    },
  };
}

function renderRow(deskMember: MuFightDeskMember, expanded = false): string {
  const [row] = buildFightDeskMemberRows([deskMember], knobs);
  if (!row) throw new Error("expected a member row");
  return renderToStaticMarkup(
    <FightDeskMemberRow
      row={row}
      rank={1}
      selected={false}
      expanded={expanded}
      nowMs={nowMs}
      onSelectedChange={() => undefined}
      onExpandedChange={() => undefined}
    />,
  );
}

describe("FightDeskMemberRow", () => {
  it("drops skills-reset copy from collapsed and expanded rows", () => {
    const html = renderRow(member("ready", "Ready", "ready", 20), true);

    expect(html).not.toContain("Reset");
    expect(html).not.toContain("skills-reset");
  });

  it("stacks HP and Hunger with both current/max numbers", () => {
    const html = renderRow(member("ready", "Ready", "ready", 20));

    expect(html).toContain("flex flex-col gap-2");
    expect(html).toContain("HP");
    expect(html).toContain("Hunger");
    expect(html).toContain("40/100");
    expect(html).toContain("20/100");
    expect(html).toContain("bg-red-500");
    expect(html).toContain("bg-emerald-500");
  });

  it("renders Ready as muted text without a pill timer", () => {
    const html = renderRow(member("ready", "Ready", "ready", 20));

    expect(html).toContain("text-muted-foreground");
    expect(html).toContain("Ready");
    expect(html).not.toContain("If pill");
  });

  it("renders active Spywera pill in emerald with a timer", () => {
    const pillEndsAt = new Date(nowMs + 90 * 60_000).toISOString();
    const html = renderRow(member("active", "Active", "active", 80, pillEndsAt));

    expect(html).toContain("text-emerald-400");
    expect(html).toContain("1h 30m");
    expect(html).toContain("Peak ");
    expect(html).not.toContain("If pill");
  });

  it("renders debuff Spywera pill in red with a timer", () => {
    const pillEndsAt = new Date(nowMs + 45 * 60_000).toISOString();
    const html = renderRow(member("debuff", "Debuff", "debuff", 50, pillEndsAt));

    expect(html).toContain("text-red-400");
    expect(html).toContain("45m");
  });

  it("always shows Peak when available, including while already pilled", () => {
    const html = renderRow(member("active", "Active", "active", 80));
    const [row] = buildFightDeskMemberRows([member("active", "Active", "active", 80)], knobs);

    expect(row?.peakDamage).not.toBeNull();
    expect(html).toContain(
      `Peak ${formatDisplayNumber(row!.peakDamage!, 0, { groupThousands: true })}`,
    );
  });

  it("tightens the xl grid after dropping reset and the separate pill column", () => {
    const html = renderRow(member("ready", "Ready", "ready", 20));

    expect(html).toContain(
      "xl:grid-cols-[auto_2rem_minmax(10rem,1fr)_minmax(11rem,1fr)_minmax(8rem,auto)_auto]",
    );
    expect(html).not.toContain("7rem_7rem");
  });
});
