import { describe, expect, it } from "vite-plus/test";
import { HttpError } from "./errors";
import { parseIsoCode } from "./iso";

describe("parseIsoCode", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseIsoCode(null)).toBeNull();
    expect(parseIsoCode(undefined)).toBeNull();
    expect(parseIsoCode("")).toBeNull();
    expect(parseIsoCode("  ")).toBeNull();
  });

  it("normalizes lowercase to uppercase", () => {
    expect(parseIsoCode("se")).toBe("SE");
    expect(parseIsoCode(" Se ")).toBe("SE");
  });

  it("rejects non-strings and invalid codes", () => {
    expect(() => parseIsoCode(12)).toThrow(HttpError);
    expect(() => parseIsoCode("SWE")).toThrow(HttpError);
    expect(() => parseIsoCode("S")).toThrow(HttpError);
    expect(() => parseIsoCode("S1")).toThrow(HttpError);
    try {
      parseIsoCode("SWE");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
      expect((err as HttpError).code).toBe("invalid_body");
    }
  });
});
