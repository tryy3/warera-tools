import { describe, expect, it, vi } from "vite-plus/test";
import type { Logger } from "../logging/types";
import { resolveCron } from "./resolve-cron";

const mockLogger = (overrides: Partial<Logger> = {}): Logger =>
  ({
    silly: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    ...overrides,
  }) as unknown as Logger;

describe("resolveCron", () => {
  it("returns db cron when valid", () => {
    const logger = mockLogger();
    expect(resolveCron("0 */5 * * * *", "0 * * * * *", logger)).toBe("0 */5 * * * *");
  });

  it("falls back on invalid db cron", () => {
    const warn = vi.fn();
    expect(resolveCron("not-a-cron", "0 * * * * *", mockLogger({ warn }))).toBe("0 * * * * *");
    expect(warn).toHaveBeenCalled();
  });
});
