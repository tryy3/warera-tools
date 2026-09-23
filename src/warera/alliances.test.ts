import { describe, expect, it } from "vite-plus/test";
import { parseAlliancePage } from "./alliances";

describe("parseAlliancePage", () => {
  it("reads id, name, and coreDevelopment from paginated items", () => {
    expect(
      parseAlliancePage({
        result: {
          data: {
            items: [
              {
                _id: "forge",
                name: "FORGE",
                coreDevelopment: 1354.29,
                currentDevelopment: 2013.99,
              },
            ],
          },
        },
      }),
    ).toEqual({
      items: [{ id: "forge", name: "FORGE", coreDevelopment: 1354.29 }],
      nextCursor: null,
    });
  });
});
