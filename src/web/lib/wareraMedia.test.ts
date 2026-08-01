import { describe, expect, it } from "vite-plus/test";
import { wareraFlagUrl, wareraItemUrl } from "./wareraMedia";

describe("wareraMedia", () => {
  it("builds item URLs with version", () => {
    expect(wareraItemUrl("cocain")).toBe("https://media.warera.io/images/items/cocain.png?v=33");
  });

  it("builds flag URLs with lowercase code and version", () => {
    expect(wareraFlagUrl("SE")).toBe("https://media.warera.io/images/flags/se.svg?v=16");
  });
});
