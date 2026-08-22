import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AppConfig } from "../config/env";
import { createServerLogger } from "./createServerLogger";
import { MASK_KEYS, resolveMaskEnabled } from "./mask";

const {
  initSentryMock,
  attachSentryTransportsMock,
  setMetricsBackendMock,
  createSentryMetricsBackendMock,
} = vi.hoisted(() => ({
  initSentryMock: vi.fn(() => true),
  attachSentryTransportsMock: vi.fn(),
  setMetricsBackendMock: vi.fn(),
  createSentryMetricsBackendMock: vi.fn(() => ({
    count: vi.fn(),
    distribution: vi.fn(),
    gauge: vi.fn(),
  })),
}));

vi.mock("./sentry", () => ({
  initSentry: initSentryMock,
  attachSentryTransports: attachSentryTransportsMock,
}));

vi.mock("../metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../metrics")>();
  return {
    ...actual,
    setMetricsBackend: setMetricsBackendMock,
  };
});

vi.mock("../metrics/sentry", () => ({
  createSentryMetricsBackend: createSentryMetricsBackendMock,
}));

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 8787,
    tursoDatabaseUrl: "file:test.db",
    tursoAuthToken: undefined,
    wareraApiBaseUrl: "https://api2.warera.io/trpc",
    wareraApiKey: undefined,
    wareraMaxRequestsPerMinute: 120,
    discordWebhookUrl: undefined,
    logLevel: "info",
    logMaskSecrets: false,
    logFile: undefined,
    sentryDsn: undefined,
    sentryEnvironment: "test",
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

describe("MASK_KEYS", () => {
  it("includes Sentry DSN fields", () => {
    expect(MASK_KEYS).toContain("SENTRY_DSN");
    expect(MASK_KEYS).toContain("dsn");
  });
});

describe("createServerLogger", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
    vi.clearAllMocks();
  });

  it("exposes level methods and child", () => {
    const logger = createServerLogger(baseConfig({ logLevel: "debug" }));
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.child({ name: "x" }).info).toBe("function");
  });

  it("masks configured keys when logMaskSecrets is true", async () => {
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

  it("does not throw when sentryDsn is unset", () => {
    expect(() => createServerLogger(baseConfig({ sentryDsn: undefined }))).not.toThrow();
    expect(initSentryMock).not.toHaveBeenCalled();
    expect(setMetricsBackendMock).not.toHaveBeenCalled();
  });

  it("wires Sentry metrics backend when initSentry succeeds", () => {
    initSentryMock.mockReturnValueOnce(true);
    createServerLogger(baseConfig({ sentryDsn: "https://example@o0.ingest.sentry.io/0" }));
    expect(initSentryMock).toHaveBeenCalledOnce();
    expect(createSentryMetricsBackendMock).toHaveBeenCalledOnce();
    expect(setMetricsBackendMock).toHaveBeenCalledOnce();
    expect(attachSentryTransportsMock).toHaveBeenCalledOnce();
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
