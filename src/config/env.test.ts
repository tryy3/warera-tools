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
    expect(cfg.wareraApiBaseUrl).toBe("https://api5.warera.io");
  });

  it("parses PORT override", () => {
    const cfg = parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      PORT: "9000",
    });
    expect(cfg.port).toBe(9000);
  });
});
