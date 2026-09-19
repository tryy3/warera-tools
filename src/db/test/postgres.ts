/**
 * Shared Postgres helper for Drizzle integration tests.
 *
 * Prefers the URL from Vitest globalSetup (`src/db/test/global-setup.ts`) so
 * one container serves the whole run even when Vitest isolates modules per file.
 * Falls back to starting a container when run outside `vp test` (ad-hoc).
 *
 * Container runtime (local / this agent environment):
 *   export DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
 *   export TESTCONTAINERS_RYUK_DISABLED=true
 */
import { readFileSync, existsSync } from "node:fs";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Db } from "../client";
import { migrateDb } from "../migrate";
import * as schema from "../schema";
import { TEST_PG_URL_FILE } from "./global-setup";

const TRUNCATE_SQL = `
TRUNCATE TABLE
  battle_loot_snapshots,
  battle_scoreboard_snapshots,
  battle_polls,
  battles,
  item_market_transactions,
  worker_work_stats,
  company_work_stats,
  donation_snapshots,
  donation_polls,
  country_watch_reasons,
  mu_watch_reasons,
  player_watch_reasons,
  user_profile_snapshots,
  user_profile_polls,
  mu_member_stat_snapshots,
  mu_stat_snapshots,
  mu_polls,
  mu_members,
  mus,
  company_packs,
  regions,
  recommended_regions,
  price_snapshots,
  price_polls,
  countries,
  cache,
  job_runs,
  jobs,
  players
RESTART IDENTITY CASCADE
`;

type SharedDb = {
  container?: StartedPostgreSqlContainer;
  pool: pg.Pool;
  db: Db;
};

let shared: SharedDb | null = null;
let sharedInit: Promise<SharedDb> | null = null;

async function resolveConnectionUri(): Promise<{
  uri: string;
  container?: StartedPostgreSqlContainer;
}> {
  if (process.env.TEST_DATABASE_URL) {
    return { uri: process.env.TEST_DATABASE_URL };
  }
  if (existsSync(TEST_PG_URL_FILE)) {
    const uri = readFileSync(TEST_PG_URL_FILE, "utf8").trim();
    if (uri) return { uri };
  }
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  return { uri: container.getConnectionUri(), container };
}

async function ensureShared(): Promise<SharedDb> {
  if (shared) return shared;
  sharedInit ??= (async () => {
    const { uri, container } = await resolveConnectionUri();
    const pool = new pg.Pool({ connectionString: uri });
    const db = drizzle(pool, { schema });
    await migrateDb(db);
    shared = { container, pool, db };
    return shared;
  })();
  return sharedInit;
}

export async function createTestDb(): Promise<{
  db: Db;
  pool: pg.Pool;
  stop: () => Promise<void>;
}> {
  const s = await ensureShared();
  return {
    db: s.db,
    pool: s.pool,
    stop: async () => {
      /* process-lifetime pool; container stopped in global teardown */
    },
  };
}

export async function truncateAllTables(db: Db): Promise<void> {
  await db.execute(sql.raw(TRUNCATE_SQL));
}
