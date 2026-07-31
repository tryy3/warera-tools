import type { Db } from "../db/client";
import type { Logger } from "../logging/logger";

export type JobContext = {
  db: Db;
  logger: Logger;
  state: Record<string, unknown> | null;
  setState: (state: Record<string, unknown> | null) => Promise<void>;
};

export type JobDefinition = {
  id: string;
  name: string;
  description: string;
  defaultCron: string; // 6-field cron
  defaultEnabled?: boolean;
  run: (ctx: JobContext) => Promise<string | void>;
};
