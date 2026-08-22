import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "./env";

describe("parseConfig", () => {
  it("defaults host/port and rate limit", () => {
    const cfg = parseConfig({
      TURSO_DATABASE_URL: "libsql://example.turso.io",
    });
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.port).toBe(8787);
    expect(cfg.wareraMaxRequestsPerMinute).toBe(120);
    expect(cfg.wareraApiBaseUrl).toBe("https://api2.warera.io/trpc");
  });

  it("parses PORT override", () => {
    const cfg = parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      PORT: "9000",
    });
    expect(cfg.port).toBe(9000);
  });

  it("defaults logMaskSecrets on in production and off otherwise", () => {
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "production",
      }).logMaskSecrets,
    ).toBe(true);
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "development",
      }).logMaskSecrets,
    ).toBe(false);
  });

  it("honors LOG_MASK_SECRETS override", () => {
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "production",
        LOG_MASK_SECRETS: "false",
      }).logMaskSecrets,
    ).toBe(false);
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "development",
        LOG_MASK_SECRETS: "true",
      }).logMaskSecrets,
    ).toBe(true);
  });

  it("parses optional LOG_FILE", () => {
    expect(parseConfig({ TURSO_DATABASE_URL: "file:test.db" }).logFile).toBeUndefined();
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        LOG_FILE: "logs/app.log",
      }).logFile,
    ).toBe("logs/app.log");
  });

  it("parses optional SENTRY_DSN", () => {
    expect(parseConfig({ TURSO_DATABASE_URL: "file:test.db" }).sentryDsn).toBeUndefined();
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        SENTRY_DSN: "https://key@o0.ingest.sentry.io/1",
      }).sentryDsn,
    ).toBe("https://key@o0.ingest.sentry.io/1");
  });

  it("defaults HOST to loopback except production → 0.0.0.0", () => {
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "development",
      }).host,
    ).toBe("127.0.0.1");
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "production",
      }).host,
    ).toBe("0.0.0.0");
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "production",
        HOST: "127.0.0.1",
      }).host,
    ).toBe("127.0.0.1");
  });

  it("sentryEnvironment falls back to nodeEnv and honors SENTRY_ENVIRONMENT", () => {
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "production",
      }).sentryEnvironment,
    ).toBe("production");
    expect(
      parseConfig({
        TURSO_DATABASE_URL: "file:test.db",
        NODE_ENV: "production",
        SENTRY_ENVIRONMENT: "staging",
      }).sentryEnvironment,
    ).toBe("staging");
  });
});
