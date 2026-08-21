import { afterEach, describe, expect, it } from "vite-plus/test";
import { count, distribution, gauge, resetMetricsForTests, setMetricsBackend } from "./index";
import { createRecordingBackend } from "./recording";

describe("metrics", () => {
  afterEach(() => {
    resetMetricsForTests();
  });

  it("no-ops when no backend is set", () => {
    expect(() => count("warera.upstream.call")).not.toThrow();
    expect(() => distribution("warera.upstream.latency_ms", 10)).not.toThrow();
    expect(() => gauge("warera.upstream.rate_limit_remaining", 499)).not.toThrow();
  });

  it("forwards to the active backend with default count value 1", () => {
    const rec = createRecordingBackend();
    setMetricsBackend(rec);
    count("warera.upstream.call", undefined, { outcome: "ok" });
    distribution("warera.upstream.latency_ms", 12, { call_class: "interactive" }, "millisecond");
    gauge("warera.upstream.rate_limit_remaining", 499);
    expect(rec.events).toEqual([
      { type: "count", name: "warera.upstream.call", value: 1, attrs: { outcome: "ok" } },
      {
        type: "distribution",
        name: "warera.upstream.latency_ms",
        value: 12,
        attrs: { call_class: "interactive" },
        unit: "millisecond",
      },
      { type: "gauge", name: "warera.upstream.rate_limit_remaining", value: 499 },
    ]);
  });

  it("swallows backend throws", () => {
    setMetricsBackend({
      count() {
        throw new Error("boom");
      },
      distribution() {
        throw new Error("boom");
      },
      gauge() {
        throw new Error("boom");
      },
    });
    expect(() => count("x")).not.toThrow();
    expect(() => distribution("x", 1)).not.toThrow();
    expect(() => gauge("x", 1)).not.toThrow();
  });
});
