import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { AppConfig } from "../config/env";
import * as schema from "./schema";

export function createDb(config: AppConfig) {
  const client = createClient({
    url: config.tursoDatabaseUrl,
    authToken: config.tursoAuthToken,
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>["db"];
