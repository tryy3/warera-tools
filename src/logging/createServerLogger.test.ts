import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { AppConfig } from "../config/env";
import { createServerLogger } from "./createServerLogger";
import { MASK_KEYS, resolveMaskEnabled } from "./mask";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 8787,
    tursoDatabaseUrl: "file:test.db",
    tursoAuthToken: undefined,
    wareraApiBaseUrl: "https://gateway.warerastats.io/trpc",
    wareraApiKey: undefined,
    wareraMaxRequestsPerMinute: 120,
    discordWebhookUrl: undefined,
    logLevel: "info",
    logMaskSecrets: false,
    logFile: undefined,
    jobRunHistoryLimit: 50,
    ...overrides,
  };
}

describe("resolveMaskEnabled", () => {
  it("follows config.logMaskSecrets", () => {
    expect(resolveMaskEnabled(baseConfig({ logMaskSecrets: true }))).toBe(true);
    expect(resolveMaskEnabled(baseConfig({ logMaskSecrets: false }))).toBe(false);
  });
});

describe("createServerLogger", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("exposes level methods and child", () => {
    const logger = createServerLogger(baseConfig({ logLevel: "debug" }));
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.child({ name: "x" }).info).toBe("function");
  });

  it("masks configured keys when logMaskSecrets is true", async () => {
    const logger = createServerLogger(
      baseConfig({
        nodeEnv: "production",
        logMaskSecrets: true,
        logLevel: "info",
        logFile: undefined,
      }),
    );
    // Use a ring/spy via child + type hidden is hard; assert mask keys exist and
    // logging a secret field does not throw. Stronger assert: write JSON file.
    const dir = mkdtempSync(join(tmpdir(), "warera-log-"));
    dirs.push(dir);
    const path = join(dir, "app.ndjson");
    const fileLogger = createServerLogger(
      baseConfig({
        nodeEnv: "production",
        logMaskSecrets: true,
        logLevel: "info",
        logFile: path,
      }),
    );
    fileLogger.info({ apiKey: "super-secret", path: "/x" }, "masked sample");
    await (fileLogger as { flush?: () => Promise<void> }).flush?.();
    // Allow transport drain
    await new Promise((r) => setTimeout(r, 50));
    const body = readFileSync(path, "utf8");
    expect(body).toContain("masked sample");
    expect(body).not.toContain("super-secret");
    expect(MASK_KEYS).toContain("apiKey");
  });

  it("writes JSON lines to LOG_FILE when set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "warera-log-"));
    dirs.push(dir);
    const path = join(dir, "app.ndjson");
    const logger = createServerLogger(
      baseConfig({
        nodeEnv: "production",
        logMaskSecrets: false,
        logFile: path,
      }),
    );
    logger.info({ ok: true }, "file sink");
    await (logger as { flush?: () => Promise<void> }).flush?.();
    await new Promise((r) => setTimeout(r, 50));
    const body = readFileSync(path, "utf8");
    expect(body).toContain("file sink");
    expect(body).toContain('"ok":true');
  });
});
