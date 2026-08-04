import { describe, expect, it } from "vite-plus/test";
import { promoteCorrelationAttrs } from "./correlation";

describe("promoteCorrelationAttrs", () => {
  it("copies known keys from _logMeta into attributes without dumping meta", () => {
    const out = promoteCorrelationAttrs(
      {
        logLevelName: "INFO",
        request_id: "r1",
        job_id: "example-heartbeat",
        job_run_id: 42,
        hostname: "nope",
      },
      { path: "/x" },
    );
    expect(out).toEqual({
      path: "/x",
      request_id: "r1",
      job_id: "example-heartbeat",
      job_run_id: 42,
    });
    expect(out).not.toHaveProperty("hostname");
    expect(out).not.toHaveProperty("logLevelName");
  });

  it("lets top-level attributes win on key collision", () => {
    const out = promoteCorrelationAttrs({ request_id: "from-meta" }, { request_id: "from-top" });
    expect(out.request_id).toBe("from-top");
  });
});
