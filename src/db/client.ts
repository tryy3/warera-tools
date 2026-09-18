import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { AppConfig } from "../config/env";
import type { Logger } from "../logging/logger";
import { instrumentPgPool } from "./instrument";
import * as schema from "./schema";

export function createDb(config: AppConfig, logger?: Logger) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const instrumented = logger ? instrumentPgPool(pool, logger) : pool;
  const db = drizzle(instrumented, { schema });
  return { db, pool: instrumented };
}

export type Db = ReturnType<typeof createDb>["db"];

/** The transaction object passed to `db.transaction`. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A real `Db` or an in-flight transaction tx; both expose the query builders. */
export type DbOrTx = Db | DbTx;
