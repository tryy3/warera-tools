import { describe, expect, it, vi } from "vite-plus/test";

const { metrics } = vi.hoisted(() => ({
  metrics: {
    count: vi.fn(),
    distribution: vi.fn(),
    gauge: vi.fn(),
  },
}));

vi.mock("@sentry/node", () => ({ metrics }));

import { createSentryMetricsBackend } from "./sentry";

describe("createSentryMetricsBackend", () => {
  it("forwards count/distribution/gauge with attributes and unit", () => {
    const backend = createSentryMetricsBackend();
    backend.count("warera.upstream.call", 1, { outcome: "ok" });
    backend.distribution(
      "warera.upstream.latency_ms",
      12,
      { call_class: "interactive" },
      "millisecond",
    );
    backend.gauge("warera.upstream.rate_limit_remaining", 499);
    expect(metrics.count).toHaveBeenCalledWith("warera.upstream.call", 1, {
      attributes: { outcome: "ok" },
    });
    expect(metrics.distribution).toHaveBeenCalledWith("warera.upstream.latency_ms", 12, {
      attributes: { call_class: "interactive" },
      unit: "millisecond",
    });
    expect(metrics.gauge).toHaveBeenCalledWith("warera.upstream.rate_limit_remaining", 499, {
      attributes: undefined,
    });
  });
});
