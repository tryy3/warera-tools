import { describe, expect, it, vi } from "vitest";
import { createDiscordNotifier } from "./notify";

describe("createDiscordNotifier", () => {
  it("posts an embed-like content payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const notifier = createDiscordNotifier({
      webhookUrl: "https://discord.com/api/webhooks/test",
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never,
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
    const notifier = createDiscordNotifier({
      webhookUrl: undefined,
      logger: { warn, error: vi.fn(), info: vi.fn() } as never,
      fetchImpl,
    });
    await notifier.notify({ title: "x", body: "y" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
