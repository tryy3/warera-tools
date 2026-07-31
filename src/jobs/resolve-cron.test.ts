import { describe, expect, it, vi } from "vitest";
import { resolveCron } from "./resolve-cron";

describe("resolveCron", () => {
  it("returns db cron when valid", () => {
    const logger = { warn: vi.fn() } as never;
    expect(resolveCron("0 */5 * * * *", "0 * * * * *", logger)).toBe("0 */5 * * * *");
  });

  it("falls back on invalid db cron", () => {
    const warn = vi.fn();
    expect(resolveCron("not-a-cron", "0 * * * * *", { warn } as never)).toBe("0 * * * * *");
    expect(warn).toHaveBeenCalled();
  });
});
