import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { CraftVsScrapPanel } from "./CraftVsScrapPanel";

describe("CraftVsScrapPanel", () => {
  it("defaults to Mythic and asks for a country when none is selected", () => {
    const html = renderToStaticMarkup(<CraftVsScrapPanel countryId="" />);

    expect(html).toContain("Craft vs scrap");
    expect(html).toContain("Mythic");
    expect(html).toContain("selected");
    expect(html).toContain("Select a country above");
  });
});
