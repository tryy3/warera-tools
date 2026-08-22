import { Logger as TsLogger } from "tslog";
import { describe, expect, it } from "vite-plus/test";
import { registerServerTsLogger, withLogContext } from "../logging/context";
import { inferCallClass } from "./call-class";

describe("inferCallClass", () => {
  it("honors an explicit override", () => {
    expect(inferCallClass("background")).toBe("background");
    expect(inferCallClass("interactive")).toBe("interactive");
  });

  it("is interactive with no job context", () => {
    registerServerTsLogger(null);
    expect(inferCallClass()).toBe("interactive");
  });

  it("is background when job_id is in log context", async () => {
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    registerServerTsLogger(log);
    await withLogContext(
      { attributes: { job_id: "price-poll" }, spanName: "price-poll", spanOp: "job.run" },
      () => {
        expect(inferCallClass()).toBe("background");
      },
    );
    registerServerTsLogger(null);
  });
});
