import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { resolveBattleLadders } from "@/battle-loot/battle";
import { LadderPanel } from "./LadderPanel";

const rows = (list: [number, string, number, string | null][]) =>
  list.map(([rank, userId, value, itemCode]) => ({ rank, userId, value, itemCode }));

function ladderFor(userId: string, damage: number) {
  const side = {
    rows: rows([
      [1, "a", 900, "pants4"],
      [2, "b", 500, "boots3"],
      [3, "me", 100, "pants3"],
    ]),
    complete: true,
  };
  const empty = { rows: [], complete: true };
  return resolveBattleLadders(
    { round: { attacker: side, defender: empty }, battle: { attacker: side, defender: empty } },
    userId,
    damage,
  ).ladders[0]!;
}

describe("LadderPanel", () => {
  it("shows the held prize, the next tier up and damage needed", () => {
    const html = renderToStaticMarkup(
      <LadderPanel ladder={ladderFor("me", 100)} showSide={false} />,
    );
    expect(html).toContain("Round prizes");
    expect(html).toContain("rank #3");
    expect(html).toContain("Advanced Pants");
    expect(html).toContain("Elite Pants");
    expect(html).toContain("+801");
  });

  it("tells the top holder there is nothing above", () => {
    const html = renderToStaticMarkup(
      <LadderPanel ladder={ladderFor("a", 900)} showSide={false} />,
    );
    expect(html).toContain("No better prize slots above.");
    expect(html).not.toContain("Next tier up");
  });

  it("labels an unranked user and lists every slot as a target", () => {
    const html = renderToStaticMarkup(<LadderPanel ladder={ladderFor("ghost", 0)} showSide />);
    expect(html).toContain("unranked");
    expect(html).toContain("attacker");
    expect(html).toContain("All slots above (3)");
  });
});
