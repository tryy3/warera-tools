import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { AppConfig } from "../config/env";
import type { Logger } from "../logging/logger";
import { instrumentLibsqlClient } from "./instrument";
import * as schema from "./schema";

export function createDb(config: AppConfig, logger?: Logger) {
  const raw = createClient({
    url: config.tursoDatabaseUrl,
    authToken: config.tursoAuthToken,
  });
  const client = logger ? instrumentLibsqlClient(raw, logger) : raw;
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>["db"];
