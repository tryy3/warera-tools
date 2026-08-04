import type { Db } from "../db/client";
import type { Logger } from "../logging/logger";
import type { WareraRequester } from "../warera/prices";

export type JobContext = {
  db: Db;
  logger: Logger;
  warera: WareraRequester;
  state: Record<string, unknown> | null;
  setState: (state: Record<string, unknown> | null) => Promise<void>;
};

export type JobDefinition = {
  id: string;
  name: string;
  description: string;
  defaultCron: string; // 6-field cron
  defaultEnabled?: boolean;
  /** Mapped to Croner maxRuns; omit / undefined = infinite. */
  defaultMaxRuns?: number;
  run: (ctx: JobContext) => Promise<string | void>;
};
