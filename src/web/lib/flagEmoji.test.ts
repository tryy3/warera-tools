import { describe, expect, it } from "vite-plus/test";
import { flagEmojiFromIso } from "./flagEmoji";

describe("flagEmojiFromIso", () => {
  it("returns empty for missing/invalid", () => {
    expect(flagEmojiFromIso(null)).toBe("");
    expect(flagEmojiFromIso(undefined)).toBe("");
    expect(flagEmojiFromIso("")).toBe("");
    expect(flagEmojiFromIso("S")).toBe("");
    expect(flagEmojiFromIso("SWE")).toBe("");
  });

  it("maps SE to Sweden flag", () => {
    expect(flagEmojiFromIso("SE")).toBe("🇸🇪");
    expect(flagEmojiFromIso("se")).toBe("🇸🇪");
  });
});
