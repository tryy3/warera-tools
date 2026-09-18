/**
 * Shared Postgres Testcontainers helper for Drizzle integration tests.
 *
 * Starts one `postgres:16-alpine` container per Vitest worker process (module
 * singleton), runs migrations once, and reuses the pool across suites.
 *
 * Container runtime (local / this agent environment):
 *   export DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
 *   export TESTCONTAINERS_RYUK_DISABLED=true
 *
 * Prefer Podman (or Docker) with a Docker-compatible API. Ryuk is often
 * problematic with rootless Podman — disable it as above. CI on
 * `ubuntu-latest` has Docker available; no workflow change required.
 *
 * Do not hardcode a host :5432 URL; each run gets a random mapped port.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Db } from "../client";
import { migrateDb } from "../migrate";
import * as schema from "../schema";

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

let shared: {
  container: StartedPostgreSqlContainer;
  pool: pg.Pool;
  db: Db;
} | null = null;

async function ensureShared() {
  if (shared) return shared;
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  const db = drizzle(pool, { schema });
  await migrateDb(db);
  shared = { container, pool, db };
  return shared;
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
      /* keep shared container for the Vitest worker process */
    },
  };
}

export async function truncateAllTables(db: Db): Promise<void> {
  await db.execute(sql.raw(TRUNCATE_SQL));
}
