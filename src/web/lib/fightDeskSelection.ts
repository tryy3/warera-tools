import type { BuildClass } from "../../build-class";
import type { PillStatus } from "../../fight-damage/types";

export type FightDeskPresetId =
  | "pilled"
  | "ready"
  | "pilled_ready"
  | "damage_build"
  | "all"
  | "none";

type FightDeskMember = {
  userId: string;
  pillStatus: PillStatus;
  buildClass: BuildClass;
};

export function applyFightDeskPreset(
  preset: FightDeskPresetId,
  members: FightDeskMember[],
): string[] {
  switch (preset) {
    case "pilled":
      return members.filter((m) => m.pillStatus === "active").map((m) => m.userId);
    case "ready":
      return members.filter((m) => m.pillStatus === "ready").map((m) => m.userId);
    case "pilled_ready":
      return members
        .filter((m) => m.pillStatus === "active" || m.pillStatus === "ready")
        .map((m) => m.userId);
    case "damage_build":
      return members.filter((m) => m.buildClass === "war").map((m) => m.userId);
    case "all":
      return members.map((m) => m.userId);
    case "none":
      return [];
  }
}
