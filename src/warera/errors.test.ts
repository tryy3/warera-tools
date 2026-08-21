import { describe, expect, it } from "vite-plus/test";
import { isWareraGetRejectedError, isWareraNotFoundError } from "./errors";

describe("isWareraNotFoundError", () => {
  it("matches HTTP 404 and NOT_FOUND messages", () => {
    expect(isWareraNotFoundError(new Error("WarEra request failed: 404 NOT_FOUND"))).toBe(true);
    expect(isWareraNotFoundError(new Error("tRPC NOT_FOUND"))).toBe(true);
    expect(isWareraNotFoundError(new Error("WarEra request failed: 502 bad gateway"))).toBe(false);
  });
});

describe("isWareraGetRejectedError", () => {
  it("matches statuses that warrant a POST fallback", () => {
    expect(isWareraGetRejectedError(new Error("WarEra request failed: 404 unknown method"))).toBe(
      true,
    );
    expect(isWareraGetRejectedError(new Error("WarEra request failed: 400"))).toBe(true);
    expect(isWareraGetRejectedError(new Error("network down"))).toBe(false);
  });
});
