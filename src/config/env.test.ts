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
    expect(cfg.wareraApiBaseUrl).toBe("https://gateway.warerastats.io/trpc");
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
});
