import { Logger as TsLogger } from "tslog";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { startSpan, getIsolationScope, setAttributes } = vi.hoisted(() => {
  const setAttributes = vi.fn();
  const getIsolationScope = vi.fn(() => ({ setAttributes }));
  const startSpan = vi.fn((_opts: unknown, fn: () => unknown) => fn());
  return { startSpan, getIsolationScope, setAttributes };
});

vi.mock("@sentry/node", () => ({
  startSpan,
  getIsolationScope,
}));

vi.mock("./sentry", () => ({
  isSentryInitialized: vi.fn(() => false),
}));

import { isSentryInitialized } from "./sentry";
import { registerServerTsLogger, withLogContext } from "./context";

describe("withLogContext", () => {
  afterEach(() => {
    registerServerTsLogger(null);
    vi.mocked(isSentryInitialized).mockReturnValue(false);
    startSpan.mockClear();
    setAttributes.mockClear();
    getIsolationScope.mockClear();
  });

  it("runs fn and exposes attrs via tslog getContext inside the callback", async () => {
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    registerServerTsLogger(log);
    let seen: Record<string, unknown> | undefined;
    await withLogContext(
      {
        attributes: { job_id: "j1", job_run_id: 7 },
        spanName: "j1",
        spanOp: "job.run",
      },
      () => {
        seen = log.getContext();
      },
    );
    expect(seen).toMatchObject({ job_id: "j1", job_run_id: 7 });
  });

  it("does not call startSpan when Sentry is not initialized", async () => {
    vi.mocked(isSentryInitialized).mockReturnValue(false);
    const result = await withLogContext(
      {
        attributes: { request_id: "r1" },
        spanName: "GET /x",
        spanOp: "http.server",
      },
      () => "ok",
    );
    expect(result).toBe("ok");
    expect(startSpan).not.toHaveBeenCalled();
  });

  it("calls startSpan with name, op, and cleaned attributes when Sentry is initialized", async () => {
    vi.mocked(isSentryInitialized).mockReturnValue(true);
    await withLogContext(
      {
        attributes: { job_id: "j1", job_run_id: 7, request_id: undefined },
        spanName: "j1",
        spanOp: "job.run",
      },
      () => undefined,
    );
    expect(startSpan).toHaveBeenCalledWith(
      {
        name: "j1",
        op: "job.run",
        attributes: { job_id: "j1", job_run_id: 7 },
      },
      expect.any(Function),
    );
    expect(setAttributes).toHaveBeenCalledWith({ job_id: "j1", job_run_id: 7 });
  });
});
