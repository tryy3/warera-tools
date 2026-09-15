import { describe, expect, it } from "vite-plus/test";
import type { BuildClass } from "../../build-class";
import type { PillStatus } from "../../fight-damage/types";
import { applyFightDeskPreset } from "./fightDeskSelection";

type Member = { userId: string; pillStatus: PillStatus; buildClass: BuildClass };

const members: Member[] = [
  { userId: "active", pillStatus: "active", buildClass: "war" },
  { userId: "ready", pillStatus: "ready", buildClass: "eco" },
  { userId: "debuff", pillStatus: "debuff", buildClass: "war" },
  { userId: "war-ready", pillStatus: "ready", buildClass: "war" },
  { userId: "unknown", pillStatus: "ready", buildClass: "unknown" },
];

describe("applyFightDeskPreset", () => {
  it("pilled selects active pill members only", () => {
    expect(applyFightDeskPreset("pilled", members)).toEqual(["active"]);
  });

  it("ready selects ready members only", () => {
    expect(applyFightDeskPreset("ready", members)).toEqual(["ready", "war-ready", "unknown"]);
  });

  it("pilled_ready selects active and ready members", () => {
    expect(applyFightDeskPreset("pilled_ready", members)).toEqual([
      "active",
      "ready",
      "war-ready",
      "unknown",
    ]);
  });

  it("damage_build selects war build members", () => {
    expect(applyFightDeskPreset("damage_build", members)).toEqual(["active", "debuff", "war-ready"]);
  });

  it("all selects every member", () => {
    expect(applyFightDeskPreset("all", members)).toEqual([
      "active",
      "ready",
      "debuff",
      "war-ready",
      "unknown",
    ]);
  });

  it("none clears selection", () => {
    expect(applyFightDeskPreset("none", members)).toEqual([]);
  });

  it("returns empty for an empty roster", () => {
    expect(applyFightDeskPreset("pilled", [])).toEqual([]);
  });
});
