import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Logger as TsLogger } from "tslog";

const { captureException, captureMessage, init, close, loggerMethods } = vi.hoisted(() => {
  const loggerMethods = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
  return {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    init: vi.fn(),
    close: vi.fn(async () => true),
    loggerMethods,
  };
});

vi.mock("@sentry/node", () => ({
  init,
  captureException,
  captureMessage,
  close,
  logger: loggerMethods,
}));

import {
  attachSentryTransports,
  closeSentry,
  initSentry,
  resetSentryStateForTests,
} from "./sentry";

describe("sentry logging", () => {
  beforeEach(() => {
    init.mockClear();
    captureException.mockClear();
    captureMessage.mockClear();
    close.mockClear();
    for (const fn of Object.values(loggerMethods)) fn.mockClear();
    resetSentryStateForTests();
  });

  it("initSentry no-ops without DSN", () => {
    expect(initSentry({ sentryDsn: undefined, nodeEnv: "development" })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("initSentry calls Sentry.init with enableLogs", () => {
    expect(
      initSentry({
        sentryDsn: "https://key@o0.ingest.sentry.io/1",
        nodeEnv: "development",
      }),
    ).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o0.ingest.sentry.io/1",
        enableLogs: true,
        tracesSampleRate: 1,
        environment: "development",
      }),
    );
  });

  it("Issues transport captures Error on error()", async () => {
    initSentry({ sentryDsn: "https://key@o0.ingest.sentry.io/1", nodeEnv: "test" });
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    attachSentryTransports(log, {
      sentryDsn: "https://key@o0.ingest.sentry.io/1",
      logLevel: "info",
    });
    const err = new Error("payment failed");
    log.error(err);
    await log.flush();
    expect(captureException).toHaveBeenCalled();
    const [passed] = captureException.mock.calls[0]!;
    expect(passed).toBeInstanceOf(Error);
    expect((passed as Error).message).toBe("payment failed");
  });

  it("Logs transport forwards info fields", async () => {
    initSentry({ sentryDsn: "https://key@o0.ingest.sentry.io/1", nodeEnv: "test" });
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    attachSentryTransports(log, {
      sentryDsn: "https://key@o0.ingest.sentry.io/1",
      logLevel: "info",
    });
    log.info({ userId: 42 }, "user logged in");
    await log.flush();
    expect(loggerMethods.info).toHaveBeenCalledWith(
      "user logged in",
      expect.objectContaining({ userId: 42 }),
    );
  });

  it("Logs transport promotes job_run_id from _logMeta", async () => {
    initSentry({ sentryDsn: "https://key@o0.ingest.sentry.io/1", nodeEnv: "test" });
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    attachSentryTransports(log, {
      sentryDsn: "https://key@o0.ingest.sentry.io/1",
      logLevel: "info",
    });
    log.runInContext({ job_run_id: 99, job_id: "example-heartbeat" }, () => {
      log.info("poll complete");
    });
    await log.flush();
    expect(loggerMethods.info).toHaveBeenCalledWith(
      "poll complete",
      expect.objectContaining({ job_run_id: 99, job_id: "example-heartbeat" }),
    );
  });

  it("closeSentry no-ops when not initialized", async () => {
    await closeSentry();
    expect(close).not.toHaveBeenCalled();
  });
});
