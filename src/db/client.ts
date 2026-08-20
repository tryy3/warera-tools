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

/** The transaction object passed to `db.transaction`. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A real `Db` or an in-flight transaction tx; both expose the query builders. */
export type DbOrTx = Db | DbTx;
