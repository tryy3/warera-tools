import { describe, expect, it } from "vite-plus/test";
import { playerBattlesPath } from "./fetchPlayerBattles";

describe("playerBattlesPath", () => {
  it("omits refresh by default and adds it on request", () => {
    expect(playerBattlesPath("u1", false)).toBe("/api/player-battles?userId=u1");
    expect(playerBattlesPath("u1", true)).toBe("/api/player-battles?userId=u1&refresh=1");
  });
});
