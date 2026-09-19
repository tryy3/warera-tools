# Turso → Postgres Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut over the toolkit from Turso/libSQL to Pigsty Postgres with happy-path types (`timestamptz`, `boolean`, `jsonb`, enums, `numeric` money) and decimal.js `Decimal` for money on server and web, plus a one-shot data copy script for the maintenance window.

**Architecture:** Replace the Drizzle SQLite dialect and `@libsql/client` with `pg` Pool + `drizzle-orm/node-postgres`. Archive existing Turso migrations under `drizzle-bak/` and regenerate from a fresh PG schema. Money uses a Drizzle `customType` backed by `numeric(20, 6)` and `Decimal`. Tests use Testcontainers Postgres. Cutover stops the app, migrates schema, copies Turso→PG, switches `DATABASE_URL`, and restarts.

**Tech Stack:** Drizzle ORM (`pg-core`), `pg`, `decimal.js`, `@testcontainers/postgresql`, Vitest via `vp test`, `tsx` scripts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-18-turso-to-postgres-migration-design.md`
- Money columns only (set B): `item_market_transactions.money`; price snapshot `market_price` / `buy_*` / `sell_*`; `donation_snapshots.amount`; work-stats `wage`; battle loot `total_money_from_*`. Not `tax_rate`, damages, bonus, production totals.
- Money precision: Postgres `numeric(20, 6)`; app type `Decimal` from `decimal.js`
- Money JSON wire format: **string** (e.g. `"12.345"`)
- Do not change formulas or UI rounding policy beyond type accuracy
- Archive `drizzle/` → `drizzle-bak/`; new journal starts at `0000` (do not convert old SQLite SQL)
- Config: require `DATABASE_URL`; remove `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` from runtime config
- Driver: `pg` Pool
- Tests: Testcontainers; CI must provide Docker
- Prefer `vp test path/to/file.test.ts`; run `vp check` before claiming a task done
- Update `docs/warera-api/inventory.md` when storage path / driver changes

## File map

| File | Responsibility |
| --- | --- |
| `src/money/decimal.ts` | `parseMoney`, `serializeMoney`, `moneyEquals`, Decimal defaults |
| `src/money/decimal.test.ts` | Unit tests for money helpers |
| `src/db/money-column.ts` | Drizzle `customType` → `numeric(20, 6)` ↔ `Decimal` |
| `src/db/schema.ts` | Full PG schema rewrite |
| `drizzle-bak/` | Archived Turso/SQLite migrations (moved from `drizzle/`) |
| `drizzle/` | Fresh PG migrations from generate |
| `drizzle.config.ts` | `postgresql` + `DATABASE_URL` |
| `src/db/client.ts` | `pg` Pool + drizzle |
| `src/db/migrate.ts` / `migrate-cli.ts` | PG migrator |
| `src/db/instrument.ts` | Pool/client query logging |
| `src/config/env.ts` (+ test) | `databaseUrl` |
| `src/logging/mask.ts` | Mask `DATABASE_URL` password-ish keys; drop Turso token |
| `src/db/test/postgres.ts` | Testcontainers helper: start, migrate, `createTestDb()` |
| `scripts/migrate-turso-to-postgres.ts` | One-shot Turso → PG copy |
| `package.json` | deps + `migrate:turso-to-postgres` script |
| `.github/workflows/ci.yml` | Ensure Docker available for Testcontainers |
| `README.md`, `.env.example`, `docker-compose.example.yml` | Postgres env docs |
| `docs/warera-api/inventory.md` | Turso → Postgres note |

---

### Task 1: Money helpers (`decimal.js`)

**Files:**
- Create: `src/money/decimal.ts`
- Create: `src/money/decimal.test.ts`
- Modify: `package.json` (add `decimal.js`, `@types` if needed)

**Interfaces:**
- Produces:
  - `parseMoney(value: string | number | Decimal | null | undefined): Decimal | null`
  - `serializeMoney(value: Decimal | null | undefined): string | null`
  - `moneyEquals(a: Decimal | null | undefined, b: Decimal | null | undefined): boolean`
  - Re-export `Decimal` from `decimal.js`

- [ ] **Step 1: Add dependency**

```bash
vp install decimal.js
# If types are separate and needed:
# vp install -D @types/decimal.js
```

- [ ] **Step 2: Write failing tests**

Create `src/money/decimal.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { Decimal, moneyEquals, parseMoney, serializeMoney } from "./decimal";

describe("parseMoney", () => {
  it("parses string and number", () => {
    expect(parseMoney("12.345")?.equals(new Decimal("12.345"))).toBe(true);
    expect(parseMoney(1.5)?.equals(new Decimal("1.5"))).toBe(true);
  });

  it("returns null for nullish", () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("passes through Decimal", () => {
    const d = new Decimal("3");
    expect(parseMoney(d)).toBe(d);
  });
});

describe("serializeMoney", () => {
  it("serializes to fixed string without float noise", () => {
    expect(serializeMoney(new Decimal("10.1"))).toBe("10.1");
    expect(serializeMoney(null)).toBeNull();
  });
});

describe("moneyEquals", () => {
  it("compares null and values", () => {
    expect(moneyEquals(null, null)).toBe(true);
    expect(moneyEquals(parseMoney("1"), parseMoney("1.0"))).toBe(true);
    expect(moneyEquals(parseMoney("1"), null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `vp test src/money/decimal.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 4: Implement helpers**

Create `src/money/decimal.ts`:

```ts
import { Decimal } from "decimal.js";

export { Decimal };

export function parseMoney(value: string | number | Decimal | null | undefined): Decimal | null {
  if (value == null) return null;
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

export function serializeMoney(value: Decimal | null | undefined): string | null {
  if (value == null) return null;
  // Avoid exponential form for API/DB friendliness
  return value.toFixed();
}

export function moneyEquals(
  a: Decimal | null | undefined,
  b: Decimal | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.equals(b);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp test src/money/decimal.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/money/decimal.ts src/money/decimal.test.ts
git commit -m "$(cat <<'EOF'
feat: add decimal.js money helpers

EOF
)"
```

---

### Task 2: Config → `DATABASE_URL`

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/config/env.test.ts`
- Modify: `src/logging/mask.ts`
- Modify: any test helpers that construct `AppConfig` with `tursoDatabaseUrl` (grep `tursoDatabaseUrl`)

**Interfaces:**
- Produces: `AppConfig.databaseUrl: string` (replaces `tursoDatabaseUrl` / `tursoAuthToken`)

- [ ] **Step 1: Update failing env tests**

In `src/config/env.test.ts`, replace every `TURSO_DATABASE_URL` fixture with `DATABASE_URL: "postgres://user:pass@localhost:5432/warera"` (or `postgresql://…`). Assert `parseConfig(…).databaseUrl` equals that URL. Expect throw when `DATABASE_URL` missing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/config/env.test.ts`  
Expected: FAIL on property names / required key

- [ ] **Step 3: Implement config + mask**

In `src/config/env.ts`, replace Turso fields with `databaseUrl: string`. Full `parseConfig` return shape:

```ts
export type AppConfig = {
  nodeEnv: "development" | "production" | "test";
  host: string;
  port: number;
  databaseUrl: string;
  wareraApiBaseUrl: string;
  wareraApiKey: string | undefined;
  wareraMaxRequestsPerMinute: number;
  discordWebhookUrl: string | undefined;
  logLevel: string;
  logMaskSecrets: boolean;
  logFile: string | undefined;
  sentryDsn: string | undefined;
  sentryEnvironment: string;
  jobRunHistoryLimit: number;
};

export function parseConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const nodeEnv = (env.NODE_ENV ?? "development") as AppConfig["nodeEnv"];
  const defaultHost = nodeEnv === "production" ? "0.0.0.0" : "127.0.0.1";
  return {
    nodeEnv,
    host: env.HOST ?? defaultHost,
    port: Number(env.PORT ?? 8787),
    databaseUrl,
    wareraApiBaseUrl: env.WARERA_API_BASE_URL ?? "https://api2.warera.io/trpc",
    wareraApiKey: env.WARERA_API_KEY,
    wareraMaxRequestsPerMinute: Number(env.WARERA_MAX_REQUESTS_PER_MINUTE ?? 120),
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    logLevel: env.LOG_LEVEL ?? "info",
    logMaskSecrets: parseBoolEnv(env.LOG_MASK_SECRETS, nodeEnv === "production"),
    logFile: env.LOG_FILE || undefined,
    sentryDsn: env.SENTRY_DSN || undefined,
    sentryEnvironment: env.SENTRY_ENVIRONMENT || nodeEnv,
    jobRunHistoryLimit: Number(env.JOB_RUN_HISTORY_LIMIT ?? 50),
  };
}
```

In `src/logging/mask.ts`, replace `"TURSO_AUTH_TOKEN"` with `"DATABASE_URL"` (mask full URL which may embed password).

Grep and fix every `tursoDatabaseUrl` / `tursoAuthToken` in tests and `createDb` call sites to use `databaseUrl` (client rewrite lands in Task 4 — for now tests that only build config should compile).

- [ ] **Step 4: Run env tests**

Run: `vp test src/config/env.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts src/logging/mask.ts
# plus any AppConfig fixture fixes required for compile
git commit -m "$(cat <<'EOF'
feat: switch app config from Turso env to DATABASE_URL

EOF
)"
```

---

### Task 3: Archive migrations + PG schema + money column

**Files:**
- Create: `src/db/money-column.ts`
- Modify: `src/db/schema.ts` (full rewrite to `pg-core`)
- Modify: `drizzle.config.ts`
- Move: `drizzle/` → `drizzle-bak/`
- Create: new `drizzle/` via generate

**Interfaces:**
- Consumes: `parseMoney` / `Decimal` from `src/money/decimal.ts`
- Produces: `moneyNumeric` custom column helper; all existing exported table symbols kept (same TS names)

- [ ] **Step 1: Create money column type**

Create `src/db/money-column.ts`:

```ts
import { customType } from "drizzle-orm/pg-core";
import { Decimal, parseMoney } from "../money/decimal";

/** Postgres numeric(20,6) mapped to decimal.js Decimal (nullable at column level). */
export const moneyNumeric = customType<{ data: Decimal; driverData: string }>({
  dataType() {
    return "numeric(20, 6)";
  },
  toDriver(value: Decimal): string {
    return value.toFixed();
  },
  fromDriver(value: unknown): Decimal {
    const parsed = parseMoney(value as string | number);
    if (!parsed) throw new Error(`Invalid money value from driver: ${String(value)}`);
    return parsed;
  },
});
```

- [ ] **Step 2: Rewrite `schema.ts` to `pg-core`**

Replace the sqlite import with:

```ts
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { moneyNumeric } from "./money-column";
```

Conversion rules (apply to **every** table):

| Old | New |
| --- | --- |
| `sqliteTable` | `pgTable` |
| `integer("id").primaryKey({ autoIncrement: true })` | `serial("id").primaryKey()` |
| `integer(…, { mode: "timestamp_ms" })` | `timestamp(…, { withTimezone: true, mode: "date" })` |
| `integer(…, { mode: "boolean" })` | `boolean(…)` |
| `text(…, { mode: "json" }).$type<T>()` | `jsonb(…).$type<T>()` |
| money fields (set B) | `moneyNumeric("…")` (`.notNull()` where required) |
| other `real(…)` | `doublePrecision(…)` |
| status text with known sets | `pgEnum` + column typed to enum |

Define enums once, e.g.:

```ts
export const jobStatusEnum = pgEnum("job_status", ["success", "error", "running"]);
export const pollStatusEnum = pgEnum("poll_status", ["success", "partial", "error"]);
```

Use `pollStatusEnum` for price/mu/donation/battle/user-profile poll `status` columns. Keep `jobs.lastStatus` as `text` or enum — prefer `jobStatusEnum` nullable.

Example — `priceSnapshots` money fields:

```ts
export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .notNull()
    .references(() => pricePolls.id),
  itemCode: text("item_code").notNull(),
  marketPrice: moneyNumeric("market_price"),
  buyMin: moneyNumeric("buy_min"),
  buyMax: moneyNumeric("buy_max"),
  buyAvg: moneyNumeric("buy_avg"),
  sellMin: moneyNumeric("sell_min"),
  sellMax: moneyNumeric("sell_max"),
  sellAvg: moneyNumeric("sell_avg"),
});
```

Example — timestamps/bools:

```ts
fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }),
isActive: boolean("is_active").notNull().default(true),
```

Keep all table/column **snake_case SQL names** and existing TS property names identical so query modules stay stable.

- [ ] **Step 3: Archive old migrations**

```bash
git mv drizzle drizzle-bak
mkdir -p drizzle
```

- [ ] **Step 4: Point drizzle-kit at Postgres**

Replace `drizzle.config.ts` with:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Generate fresh migrations**

```bash
# Needs a reachable Postgres URL for kit; local Pigsty or ephemeral is fine
DATABASE_URL="postgres://…" vp run db:generate
```

Expected: `drizzle/0000_*.sql` creating all tables with `numeric(20,6)`, `timestamptz`, `jsonb`, enums.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/money-column.ts drizzle.config.ts drizzle drizzle-bak
git commit -m "$(cat <<'EOF'
feat: rewrite Drizzle schema for Postgres happy-path types

EOF
)"
```

---

### Task 4: DB client, migrator, instrumentation

**Files:**
- Modify: `src/db/client.ts`
- Modify: `src/db/migrate.ts`
- Modify: `src/db/instrument.ts`
- Modify: `package.json` (add `pg`; remove `@libsql/client` when unused)
- Modify: call sites of `createDb(config)`

**Interfaces:**
- Consumes: `AppConfig.databaseUrl`
- Produces: `createDb(config, logger?)` returning `{ db, pool }` (pool replaces libsql `client`)
- Keep exported types `Db`, `DbTx`, `DbOrTx`

- [ ] **Step 1: Install `pg`**

```bash
vp install pg
vp install -D @types/pg
```

- [ ] **Step 2: Implement client**

Replace `src/db/client.ts`:

```ts
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
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | DbTx;
```

Update every destructure of `{ db, client }` from `createDb` to `{ db, pool }` (grep `createDb`).

- [ ] **Step 3: Rewrite instrument for Pool**

Replace `src/db/instrument.ts` to wrap `pool.query` / `pool.connect` so each query logs `{ sql, durationMs }` at `debug` with message `"db query"` (same shape as today). Truncate SQL to ~180 chars. Do not log parameters that may contain secrets beyond what SQL text already shows.

Minimal approach — wrap `Pool.prototype.query` on the instance:

```ts
import type { Logger } from "../logging/logger";
import type pg from "pg";

function truncateSql(sql: string, max = 180): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

export function instrumentPgPool(pool: pg.Pool, logger: Logger): pg.Pool {
  const query = pool.query.bind(pool);
  // Overload-safe wrapper: log then forward
  (pool as pg.Pool).query = ((...args: unknown[]) => {
    const started = performance.now();
    const sql = typeof args[0] === "string" ? args[0] : String((args[0] as { text?: string })?.text ?? "");
    const result = (query as (...a: unknown[]) => Promise<unknown>)(...args);
    return Promise.resolve(result).then(
      (rows) => {
        logger.debug(
          { sql: truncateSql(sql), durationMs: Math.round(performance.now() - started) },
          "db query",
        );
        return rows;
      },
      (err) => {
        logger.debug(
          {
            sql: truncateSql(sql),
            durationMs: Math.round(performance.now() - started),
            error: err instanceof Error ? err.message : String(err),
          },
          "db query",
        );
        throw err;
      },
    );
  }) as typeof pool.query;
  return pool;
}
```

Adjust typing until `vp check` is clean — behavior is “log every pool.query”.

- [ ] **Step 4: PG migrator**

Replace `src/db/migrate.ts`:

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import type { createDb } from "./client";

export async function migrateDb(db: ReturnType<typeof createDb>["db"]) {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
```

Keep `migrate-cli.ts` bootstrapping config + `createDb` + `migrateDb` + `pool.end()`.

- [ ] **Step 5: Typecheck**

Run: `vp check`  
Expected: PASS for client/migrate/instrument/config (tests still fail until Task 5–6)

- [ ] **Step 6: Commit**

```bash
git add src/db/client.ts src/db/migrate.ts src/db/instrument.ts src/db/migrate-cli.ts package.json pnpm-lock.yaml
# plus createDb call-site fixes
git commit -m "$(cat <<'EOF'
feat: use node-postgres Pool and PG migrator

EOF
)"
```

---

### Task 5: Testcontainers Postgres helper

**Files:**
- Create: `src/db/test/postgres.ts`
- Create: `src/db/test/postgres.test.ts` (smoke: insert jobs row)
- Modify: `package.json` (add `@testcontainers/postgresql`, `testcontainers`)
- Modify: `.github/workflows/ci.yml` if Docker is not already available on `ubuntu-latest` (it is — document; no change required unless tests need privileged — default works)

**Interfaces:**
- Produces:
  - `createTestDb(): Promise<{ db: Db; pool: pg.Pool; stop: () => Promise<void> }>`
  - Starts Postgres container once per process (module singleton), runs `migrateDb`, returns drizzle `db`
  - `stop` ends pool; container may stay for process lifetime (Vitest worker)

- [ ] **Step 1: Add deps**

```bash
vp install -D @testcontainers/postgresql testcontainers
```

- [ ] **Step 2: Write failing smoke test**

Create `src/db/test/postgres.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vite-plus/test";
import * as schema from "../schema";
import { createTestDb } from "./postgres";

describe("createTestDb", () => {
  let stop: () => Promise<void>;

  afterAll(async () => {
    if (stop) await stop();
  });

  it("migrates and accepts inserts", async () => {
    const ctx = await createTestDb();
    stop = ctx.stop;
    await ctx.db.insert(schema.jobs).values({
      id: "heartbeat",
      name: "Heartbeat",
      cron: "0 * * * * *",
    });
    const rows = await ctx.db.select().from(schema.jobs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("heartbeat");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `vp test src/db/test/postgres.test.ts`  
Expected: FAIL (helper missing). Requires Docker running locally.

- [ ] **Step 4: Implement helper**

Create `src/db/test/postgres.ts`:

```ts
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
```

If generate renamed/added tables, update `TRUNCATE_SQL` to match. Export `truncateAllTables` for `beforeEach` in suites.

- [ ] **Step 5: Run smoke test**

Run: `vp test src/db/test/postgres.test.ts`  
Expected: PASS (Docker required)

- [ ] **Step 6: Commit**

```bash
git add src/db/test/postgres.ts src/db/test/postgres.test.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
test: add Testcontainers Postgres helper for Drizzle suites

EOF
)"
```

---

### Task 6: Retarget libSQL tests to Testcontainers

**Files:** every file listed below (replace in-memory libSQL setup with `createTestDb` + `truncateAllTables`).

**LibSQL test files to convert (complete list):**

```
src/db/battle-stats.test.ts
src/db/battles.test.ts
src/db/company-packs.test.ts
src/db/country-sync.test.ts
src/db/donations.test.ts
src/db/item-market-transactions.test.ts
src/db/item-market-tx-player.test.ts
src/db/item-market-tx-read.test.ts
src/db/mu-history.test.ts
src/db/mu-stats.test.ts
src/db/mus.test.ts
src/db/players.test.ts
src/db/price-history.test.ts
src/db/recommended-regions.test.ts
src/db/regions.test.ts
src/db/user-profiles.test.ts
src/db/watch-reasons.test.ts
src/db/work-stats.test.ts
src/economy/advisor.test.ts
src/growth/bootstrap.test.ts
src/jobs/battle-info-poll/run.test.ts
src/jobs/donation-poll/run.test.ts
src/jobs/item-market-tx/ingest.test.ts
src/jobs/item-market-tx-poll/run.test.ts
src/jobs/mu-member-poll/run.test.ts
src/jobs/mu-stats-poll/run.test.ts
src/jobs/prune.test.ts
src/jobs/recommended-regions-poll/run.test.ts
src/jobs/region-sync/run.test.ts
src/jobs/runner.test.ts
src/jobs/sync-followed-players.test.ts
src/jobs/work-stats-poll/run.test.ts
src/server/routes/battle-build.test.ts
src/server/routes/countries.test.ts
src/server/routes/equipment.test.ts
src/server/routes/follow.test.ts
src/server/routes/growth.test.ts
src/server/routes/market.test.ts
src/server/routes/mu.test.ts
src/server/routes/prices.test.ts
src/server/routes/scraps.test.ts
src/server/routes/user.test.ts
src/user/resolve-user-by-id.test.ts
```

**Interfaces:**
- Consumes: `createTestDb`, `truncateAllTables`

- [ ] **Step 1: Convert one reference suite fully (`src/db/players.test.ts`)**

Remove `@libsql/client` / `drizzle-orm/libsql` / hand `CREATE TABLE`. Use:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";

describe("players db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  // existing assertions unchanged except money fields use Decimal / moneyEquals
});
```

- [ ] **Step 2: Run reference suite**

Run: `vp test src/db/players.test.ts`  
Expected: PASS

- [ ] **Step 3: Convert remaining files in the list**

For each file:

1. Delete libSQL client setup and any raw `CREATE TABLE` SQL.
2. Add `beforeAll` → `createTestDb()`; `beforeEach` → `truncateAllTables(db)`.
3. Where tests insert/assert money floats, use `new Decimal("…")` / `moneyEquals`.
4. Where `AppConfig` is built, use `databaseUrl: containerUri` **or** avoid real config and pass `db` directly (preferred).

Do not leave any `createClient` / `drizzle-orm/libsql` imports in `src/`.

- [ ] **Step 4: Run full test suite**

Run: `vp test`  
Expected: PASS (Docker required)

- [ ] **Step 5: Remove `@libsql/client` dependency**

```bash
vp install # after removing from package.json dependencies
```

Confirm `package.json` no longer lists `@libsql/client`.

- [ ] **Step 6: Commit**

```bash
git add src package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
test: retarget DB suites from libSQL to Testcontainers Postgres

EOF
)"
```

---

### Task 7: Money `Decimal` through DB modules, API, and web

**Files (primary):**
- Modify: `src/db/prices.ts` (`PriceSnapshotRow` money fields → `Decimal | null`)
- Modify: `src/db/item-market-transactions.ts` (+ ingest callers)
- Modify: `src/db/donations.ts`, `src/db/work-stats.ts`, `src/db/battle-stats.ts` (loot money)
- Modify: server routes that JSON-serialize those fields (`src/server/routes/prices.ts`, `market.ts`, `equipment.ts`, …)
- Modify: web feature types + math that consume money (`src/web/features/market/**`, `equipment-market/**`, `companies/**`, etc.)
- Modify: domain math that uses market money (`src/market/costBook.ts`, `src/battle-build/quote.ts`, …)

**Interfaces:**
- Consumes: `parseMoney`, `serializeMoney`, `Decimal`
- Produces: DB rows expose `Decimal`; API responses expose money as **string | null**; web parses with `parseMoney` before math

- [ ] **Step 1: Update `PriceSnapshotRow` and price DB module**

```ts
import type { Decimal } from "../money/decimal";

export type PriceSnapshotRow = {
  itemCode: string;
  marketPrice: Decimal | null;
  buyMin: Decimal | null;
  buyMax: Decimal | null;
  buyAvg: Decimal | null;
  sellMin: Decimal | null;
  sellMax: Decimal | null;
  sellAvg: Decimal | null;
};
```

Fix compile errors in callers; when building API JSON:

```ts
marketPrice: serializeMoney(p.marketPrice),
```

- [ ] **Step 2: Propagate through remaining money DB modules**

Same pattern for item market `money`, donation `amount`, wages, loot money fields. Keep non-money `doublePrecision` as `number`.

- [ ] **Step 3: Web parse boundary**

Where fetch/JSON types currently say `money: number` / `marketPrice: number`, change to `string | null` on the wire type, then `parseMoney` at the feature boundary before arithmetic. Leave **display** formatters taking `Decimal | number | string` via `parseMoney` internally if needed — do not add a new “max 3 decimal” policy.

- [ ] **Step 4: Note client-side calc sites**

While converting, append a short list under `docs/superpowers/specs/2026-09-18-turso-to-postgres-migration-design.md` (or a “Notes” subsection in this plan’s commit message body is not enough — add `## Implementation notes` at the bottom of the design doc) listing files that still do money math on the client (companies sim, taxExcl, etc.) now on `Decimal`. No redesign.

- [ ] **Step 5: Run focused tests + check**

```bash
vp test src/db/price-history.test.ts src/db/item-market-transactions.test.ts src/server/routes/prices.test.ts
vp check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src docs/superpowers/specs/2026-09-18-turso-to-postgres-migration-design.md
git commit -m "$(cat <<'EOF'
feat: use Decimal for money across DB, API wire strings, and web

EOF
)"
```

---

### Task 8: Turso → Postgres data copy script

**Files:**
- Create: `scripts/migrate-turso-to-postgres.ts`
- Modify: `package.json` script `migrate:turso-to-postgres`

**Interfaces:**
- CLI env: `TURSO_DATABASE_URL`, optional `TURSO_AUTH_TOKEN`, `DATABASE_URL`
- Flags: `--truncate` (TRUNCATE CASCADE all app tables on PG before copy)

- [ ] **Step 1: Implement script skeleton**

Create `scripts/migrate-turso-to-postgres.ts` that:

1. Reads env; opens libSQL **read** client (`@libsql/client` as a **devDependency** or script-only dependency — re-add if removed, scoped to this script).
2. Opens `pg` Pool to `DATABASE_URL`.
3. If `--truncate`, truncates all app tables (`RESTART IDENTITY CASCADE`).
4. Copies tables in FK-safe order (parents before children). Suggested order:

```
jobs → job_runs → cache → countries → price_polls → price_snapshots
→ recommended_regions → regions → company_packs → mus → mu_members
→ mu_polls → mu_stat_snapshots → mu_member_stat_snapshots
→ user_profile_polls → user_profile_snapshots → players
→ player_watch_reasons → mu_watch_reasons → country_watch_reasons
→ donation_polls → donation_snapshots
→ company_work_stats → worker_work_stats
→ item_market_transactions
→ battles → battle_polls → battle_scoreboard_snapshots → battle_loot_snapshots
```

5. For each table: `SELECT *` from Turso in pages (e.g. 500 rows); transform; `INSERT` into PG (multi-row).
6. Transforms:
   - timestamp ints (ms) → `new Date(ms)`
   - bool ints → `Boolean(v)`
   - JSON text → `JSON.parse` (null-safe)
   - money reals → `new Decimal(String(v)).toFixed()` for bind as string
7. After copy: `setval` for every `serial` sequence to `MAX(id)` (query `pg_get_serial_sequence`).
8. Print per-table source count, dest count, and for money tables `SUM(money::numeric)` (or equivalent) on both sides when possible.

Fail fast with table name + batch index on error.

Because the script talks to **legacy Turso**, keep `@libsql/client` available for this script even after the app drops it:

```bash
vp install -D @libsql/client
```

- [ ] **Step 2: Wire package script**

```json
"migrate:turso-to-postgres": "tsx scripts/migrate-turso-to-postgres.ts"
```

- [ ] **Step 3: Dry-run against a disposable PG database**

```bash
TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… DATABASE_URL=… \
  pnpm run migrate:turso-to-postgres -- --truncate
```

Expected: counts match; spot-check one money sum.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-turso-to-postgres.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat: add Turso to Postgres one-shot data copy script

EOF
)"
```

---

### Task 9: Docs, inventory, examples, design status

**Files:**
- Modify: `README.md` (Turso → Postgres / `DATABASE_URL` / Pigsty note)
- Modify: `.env.example` if present
- Modify: `docker-compose.example.yml` comment
- Modify: `docs/warera-api/inventory.md` (storage backend)
- Modify: `docs/superpowers/specs/2026-09-18-turso-to-postgres-migration-design.md` status → **Approved**
- Add cutover checklist section to README or `docs/superpowers/specs/…` (already in design — ensure README points to it)

- [ ] **Step 1: Update operator docs**

README minimum:

- Require `DATABASE_URL` (Postgres)
- Mention Testcontainers/Docker for tests
- Link design cutover checklist
- Remove Turso-first local `file:` instructions (optional: note archived `drizzle-bak`)

- [ ] **Step 2: Update inventory**

In `docs/warera-api/inventory.md`, state persisted data lives in **Postgres (Pigsty)** via Drizzle; remove Turso as the system of record.

- [ ] **Step 3: `vp check` + full `vp test`**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example docker-compose.example.yml docs
git commit -m "$(cat <<'EOF'
docs: document Postgres cutover and update WarEra data inventory

EOF
)"
```

---

## Cutover (operator — not a code task)

1. Stop WarEra process.
2. Confirm Pigsty `DATABASE_URL` from app host.
3. `pnpm run db:migrate` (or boot migrator) on empty PG.
4. `pnpm run migrate:turso-to-postgres -- --truncate` (omit truncate on fresh empty DB if preferred).
5. Review count/checksum output.
6. Deploy build with `DATABASE_URL` only.
7. Start server; smoke health, shell player, prices/equipment, jobs; confirm one job run.
8. Keep Turso offline as rollback until confident.

---

## Plan self-review

| Spec requirement | Task |
| --- | --- |
| Happy-path types | Task 3 |
| Money set B + numeric(20,6) + Decimal server/web | Tasks 1, 3, 7 |
| Money JSON string | Task 7 |
| Archive drizzle → drizzle-bak, fresh 0000 | Task 3 |
| pg Pool + DATABASE_URL | Tasks 2, 4 |
| Testcontainers | Tasks 5–6 |
| Data copy script + sequence reset | Task 8 |
| Docs / inventory | Task 9 |
| Maintenance-window cutover | Cutover section |
| No formula/UI policy change | Global constraints + Task 7 |
