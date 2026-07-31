import { describe, expect, it } from "vite-plus/test";
import { parseScrapsPrice } from "./prices";

describe("parseScrapsPrice", () => {
  it("reads result.data.scraps", () => {
    expect(parseScrapsPrice({ result: { data: { scraps: 0.215 } } })).toBe(0.215);
  });
  it("throws when missing", () => {
    expect(() => parseScrapsPrice({ result: { data: {} } })).toThrow();
  });
});
