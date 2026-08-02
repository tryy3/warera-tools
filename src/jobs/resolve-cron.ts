import { Cron } from "croner";
import type { Logger } from "../logging/logger";

export function resolveCron(
  dbCron: string | null | undefined,
  defaultCron: string,
  logger: Logger,
): string {
  if (dbCron == null || dbCron === "") {
    return defaultCron;
  }

  try {
    new Cron(dbCron);
    return dbCron;
  } catch (err) {
    logger.warn(
      {
        dbCron,
        defaultCron,
        error: err instanceof Error ? err.message : String(err),
      },
      "invalid job cron; using default",
    );
    return defaultCron;
  }
}
