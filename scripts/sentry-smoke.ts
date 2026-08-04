import "dotenv/config";
import * as Sentry from "@sentry/node";
import { Logger as TsLogger } from "tslog";
import { parseConfig } from "../src/config/env";
import {
  attachSentryTransports,
  closeSentry,
  initSentry,
  resetSentryStateForTests,
} from "../src/logging/sentry";

async function main(): Promise<void> {
  const cfg = parseConfig(process.env);
  console.log(
    JSON.stringify(
      {
        hasDsn: Boolean(cfg.sentryDsn),
        dsnHost: cfg.sentryDsn ? new URL(cfg.sentryDsn).host : null,
        nodeEnv: cfg.nodeEnv,
        logLevel: cfg.logLevel,
      },
      null,
      2,
    ),
  );

  if (!cfg.sentryDsn) {
    console.error("NO_DSN");
    process.exitCode = 2;
    return;
  }

  resetSentryStateForTests();
  // Probe with SDK debug so we see envelope traffic in this process.
  try {
    Sentry.init({
      dsn: cfg.sentryDsn,
      enableLogs: true,
      environment: cfg.nodeEnv,
      debug: true,
    });
  } catch (err) {
    console.error("direct init failed", err);
    process.exitCode = 1;
    return;
  }

  // Mark our module initialized so attachSentryTransports will wire up.
  // initSentry would no-op/re-init; force attach after manual init:
  resetSentryStateForTests();
  if (!initSentry(cfg)) {
    console.error("initSentry returned false");
    process.exitCode = 1;
    return;
  }

  const log = new TsLogger({ type: "hidden", minLevel: "INFO", name: "smoke" });
  attachSentryTransports(log, cfg);
  log.info({ smoke: true }, "sentry smoke info");
  log.error(new Error("sentry smoke error"));
  await log.flush();
  const flushed = await Sentry.flush(10_000);
  console.log(JSON.stringify({ flushed }, null, 2));
  await closeSentry();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
