import { describe, expect, it } from "vite-plus/test";
import { nextPlayerFromRoute } from "./syncPlayerSearch";

describe("nextPlayerFromRoute", () => {
  it("does nothing when route has no userId (Market/etc. must not clear shell)", () => {
    expect(
      nextPlayerFromRoute(undefined, undefined, { userId: "u1", username: "Ada" }),
    ).toBeUndefined();
    expect(nextPlayerFromRoute(undefined, undefined, null)).toBeUndefined();
  });

  it("hydrates from route when shell is empty", () => {
    expect(nextPlayerFromRoute("u1", "Ada", null)).toEqual({
      userId: "u1",
      username: "Ada",
    });
  });

  it("updates shell when route userId differs", () => {
    expect(nextPlayerFromRoute("u2", "Bob", { userId: "u1", username: "Ada" })).toEqual({
      userId: "u2",
      username: "Bob",
    });
  });

  it("returns undefined when already in sync (no change)", () => {
    expect(nextPlayerFromRoute("u1", "Ada", { userId: "u1", username: "Ada" })).toBeUndefined();
  });
});
