import { serve } from "@hono/node-server";
import { loadConfig } from "../config/env";
import { createDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { seedDefaultCountries } from "../db/seed-countries";
import { createDiscordNotifier } from "../discord";
import {
  listJobDefinitions,
  reconcileInterruptedRuns,
  startScheduler,
  syncJobsToDb,
} from "../jobs";
import { createLogger } from "../logging/logger";
import { createWareraClient } from "../warera";
import { createApp } from "./app";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const { db, client } = createDb(config, logger);

  await migrateDb(db);
  await seedDefaultCountries(db);
  await syncJobsToDb(db, listJobDefinitions());
  await reconcileInterruptedRuns(db, logger);

  const warera = createWareraClient({ config, logger });
  createDiscordNotifier({ webhookUrl: config.discordWebhookUrl, logger });

  const scheduler = await startScheduler({
    db,
    logger,
    warera,
    jobRunHistoryLimit: config.jobRunHistoryLimit,
  });
  const app = createApp({ db, logger, scheduler, config, warera });

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    logger.info({ host: info.address, port: info.port, env: config.nodeEnv }, "server listening");
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    scheduler.stop();
    server.close(() => {
      client.close();
      process.exit(0);
    });
    // Fallback if close hangs
    setTimeout(() => {
      client.close();
      process.exit(0);
    }, 5_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
