import { describe, expect, it } from "vite-plus/test";
import { parseMuDetailSearch } from "./muSearch";

describe("parseMuDetailSearch", () => {
  it("defaults invalid tabs to overview", () => {
    expect(parseMuDetailSearch({}).tab).toBe("overview");
    expect(parseMuDetailSearch({ tab: "settings" }).tab).toBe("overview");
  });

  it("accepts members and fight tabs", () => {
    expect(parseMuDetailSearch({ tab: "members" }).tab).toBe("members");
    expect(parseMuDetailSearch({ tab: "fight" }).tab).toBe("fight");
  });
});
