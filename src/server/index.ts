import { serve } from "@hono/node-server";
import { loadConfig } from "../config/env";
import { createDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { createDiscordNotifier } from "../discord";
import { listJobDefinitions, startScheduler, syncJobsToDb } from "../jobs";
import { createLogger } from "../logging/logger";
import { createWareraClient } from "../warera";
import { createApp } from "./app";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const { db, client } = createDb(config);

  await migrateDb(db);
  await syncJobsToDb(db, listJobDefinitions());

  // Construct integrations at boot for readiness (wired into jobs/routes later).
  createWareraClient({ config, logger });
  createDiscordNotifier({ webhookUrl: config.discordWebhookUrl, logger });

  const scheduler = await startScheduler({ db, logger });
  const app = createApp({ db, logger, scheduler, config });

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
