import { loadConfig } from "../config/env";
import { createDb } from "./client";
import { migrateDb } from "./migrate";

const config = loadConfig();
const { db, pool } = createDb(config);
await migrateDb(db);
await pool.end();
