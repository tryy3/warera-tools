import { describe, expect, it, vi } from "vite-plus/test";
import type { Logger } from "../logging/types";
import { createDiscordNotifier } from "./notify";

const mockLogger = (): Logger =>
  ({
    silly: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  }) as unknown as Logger;

describe("createDiscordNotifier", () => {
  it("posts an embed-like content payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const notifier = createDiscordNotifier({
      webhookUrl: "https://discord.com/api/webhooks/test",
      logger: mockLogger(),
      fetchImpl,
    });
    await notifier.notify({ title: "Hello", body: "World", severity: "info" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body.content).toContain("Hello");
    expect(body.content).toContain("World");
  });

  it("no-ops when webhook missing", async () => {
    const fetchImpl = vi.fn();
    const warn = vi.fn();
    const logger = { ...mockLogger(), warn } as unknown as Logger;
    const notifier = createDiscordNotifier({
      webhookUrl: undefined,
      logger,
      fetchImpl,
    });
    await notifier.notify({ title: "x", body: "y" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
