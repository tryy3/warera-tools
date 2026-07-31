import { loadConfig } from "../config/env";
import { createDb } from "./client";
import { migrateDb } from "./migrate";

const config = loadConfig();
const { db, client } = createDb(config);
await migrateDb(db);
client.close();
