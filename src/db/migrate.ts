import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import type { createDb } from "./client";

export async function migrateDb(db: ReturnType<typeof createDb>["db"]) {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
