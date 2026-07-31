# WarEra Toolkit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a single-process personal WarEra toolkit with Hono + React/Vite+, Turso/Drizzle, cron jobs with history, pino logging, and WarEra/Discord client stubs.

**Architecture:** One Node process serves a Hono JSON API, the built React SPA, and an in-process Croner scheduler. Shared modules live under `src/` (`config`, `db`, `warera`, `discord`, `jobs`); the WebUI is a Vite React SPA under `src/web` with feature folders. Code-defined jobs upsert into Turso; DB holds enablement, cron overrides, last-run fields, and job `state`.

**Tech Stack:** TypeScript, Vite+ (`vp`), pnpm (fallback npm), React, Hono, `@hono/node-server`, Drizzle ORM, `@libsql/client` (Turso), Croner, pino, Vitest, Nix flake + devenv.

## Global Constraints

- Single package (not a monorepo); modular folders per job and WebUI feature
- One Node process: API + static SPA + scheduler
- Prefer pnpm via Vite+; fall back to npm only if pnpm setup fails
- Turso + Drizzle for persistence
- Cron expressions with seconds (Croner 6-field); no interval math for due checks
- pino structured logging to console; centralize logger construction for future file transport
- Discord webhooks only (no bot)
- No auth UI; localhost bind; leave BetterAuth middleware hook
- WarEra base URL default `https://gateway.warerastats.io/trpc` (fallback `https://api2.warera.io/trpc`); soft rate limit default 120/min; only official api2 allowlisted procedures
- System packages via flake/devenv; npm/pnpm only for JS deps
- No Docker, no real trade/calculator features, no live WarEra integration tests in this plan
- Follow design spec: `docs/superpowers/specs/2026-07-31-warera-toolkit-foundation-design.md`

## File Structure

| Path | Responsibility |
| --- | --- |
| `flake.nix`, `.envrc` | Nix/devenv shell (Node, pnpm, direnv) |
| `package.json`, `vite.config.ts`, `tsconfig*.json` | Vite+ app + scripts |
| `.env.example`, `.gitignore` | Secrets template + ignore rules |
| `src/config/env.ts` | Typed env loading |
| `src/logging/logger.ts` | Central pino factory |
| `src/db/schema.ts` | Drizzle tables: `jobs`, `job_runs`, `cache` |
| `src/db/client.ts` | Turso/libSQL + Drizzle client |
| `src/db/migrate.ts` | Apply migrations on boot |
| `src/db/cache.ts` | `getCached` / `setCached` / `getOrFetch` + freshness helper |
| `src/warera/rate-limit.ts` | Sliding-window / token-bucket limiter |
| `src/warera/client.ts` | HTTP client with rate limit + logging |
| `src/discord/notify.ts` | Webhook `notify()` |
| `src/jobs/types.ts` | `JobDefinition`, statuses |
| `src/jobs/registry.ts` | Code job list + DB upsert |
| `src/jobs/runner.ts` | Execute one job with persistence + overlap guard |
| `src/jobs/scheduler.ts` | Croner subscriptions from DB/code cron |
| `src/jobs/prune.ts` | Keep last N `job_runs` per job |
| `src/jobs/example-heartbeat/index.ts` | Sample job |
| `src/server/errors.ts` | JSON error helpers |
| `src/server/middleware/auth-placeholder.ts` | No-op auth hook for BetterAuth later |
| `src/server/routes/jobs.ts` | Jobs admin API |
| `src/server/routes/health.ts` | Health check |
| `src/server/app.ts` | Hono app composition |
| `src/server/index.ts` | Process entry + graceful shutdown |
| `src/web/**` | React SPA shell + Dashboard + Jobs features |
| `drizzle/` | Generated SQL migrations |
| `src/**/*.test.ts` | Vitest unit tests colocated or under `src/` |

---

### Task 1: Nix flake, devenv, gitignore

**Files:**
- Create: `flake.nix`
- Create: `.envrc`
- Create: `.gitignore`
- Create: `README.md` (minimal — expand in final task)

**Interfaces:**
- Consumes: nothing
- Produces: `nix develop --no-pure-eval` (or direnv) with Node 22 + pnpm available

- [ ] **Step 1: Write `flake.nix`**

```nix
{
  description = "WarEra personal toolkit";

  inputs = {
    nixpkgs.url = "github:cachix/devenv-nixpkgs/rolling";
    devenv.url = "github:cachix/devenv";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = inputs @ { flake-parts, nixpkgs, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.devenv.flakeModule ];
      systems = nixpkgs.lib.systems.flakeExposed;

      perSystem = { pkgs, ... }: {
        devenv.shells.default = {
          packages = with pkgs; [ git curl ];

          languages.javascript = {
            enable = true;
            package = pkgs.nodejs_22;
            pnpm.enable = true;
          };

          enterShell = ''
            echo "WarEra devenv: node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo n/a)"
            if ! command -v vp >/dev/null 2>&1; then
              echo "Note: install Vite+ CLI with: curl -fsSL https://vite.plus | bash"
            fi
          '';
        };
      };
    };
}
```

- [ ] **Step 2: Write `.envrc`**

```bash
use flake . --no-pure-eval
```

- [ ] **Step 3: Write `.gitignore`**

```gitignore
node_modules/
dist/
.env
.env.local
*.log
.direnv/
.devenv/
.vite/
coverage/
.DS_Store
drizzle/meta/*_snapshot.json
```

Keep `drizzle/*.sql` tracked. Adjust if drizzle-kit layout differs after Task 5.

- [ ] **Step 4: Write minimal `README.md`**

```markdown
# WarEra Toolkit

Personal tools for warera.io (jobs, calculators, WebUI).

See `docs/superpowers/specs/2026-07-31-warera-toolkit-foundation-design.md`.

## Dev

```bash
direnv allow   # or: nix develop --no-pure-eval
# Install vp if missing: curl -fsSL https://vite.plus | bash
vp install
vp run dev
```
```

- [ ] **Step 5: Enter shell and verify**

Run: `nix develop --no-pure-eval -c bash -lc 'node -v && pnpm -v'`  
Expected: Node v22.x and a pnpm version print.

- [ ] **Step 6: Commit**

```bash
git add flake.nix .envrc .gitignore README.md
git commit -m "chore: add Nix devenv shell and gitignore"
```

---

### Task 2: Scaffold Vite+ React TypeScript app with pnpm

**Files:**
- Create/overwrite via scaffold: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css` (paths may vary slightly per Vite+ template)
- Modify: move web entry files under `src/web/` in Task 3; this task gets a working Vite+ baseline

**Interfaces:**
- Consumes: Task 1 shell (`vp` or install it)
- Produces: `vp install`, `vp check`, `vp test` runnable; package manager = pnpm

- [ ] **Step 1: Ensure `vp` exists**

Run: `command -v vp || curl -fsSL https://vite.plus | bash`  
Then open a new shell / re-enter devenv so `vp` is on `PATH`.  
Expected: `vp help` prints usage.

- [ ] **Step 2: Scaffold into a temp dir (repo already has `docs/` + git)**

```bash
rm -rf /tmp/warera-vp-scaffold
vp create vite \
  --directory /tmp/warera-vp-scaffold \
  --package-manager pnpm \
  --no-git \
  --no-hooks \
  --no-interactive \
  --approve-builds \
  -- \
  --template react-ts
```

If `--no-interactive` / flags differ on the installed `vp` version, run `vp create --help` and use the closest non-interactive React-TS + pnpm options. Prefer pnpm; only switch to `--package-manager npm` if pnpm fails.

- [ ] **Step 3: Copy scaffold into repo root**

Copy `package.json`, lockfile (`pnpm-lock.yaml`), Vite+/TS config files, `index.html`, and `src/` from the temp scaffold into `/home/tryy3/src/warera/`, without deleting `docs/` or `flake.nix`.

- [ ] **Step 4: Install and verify toolchain**

```bash
cd /home/tryy3/src/warera
vp install
vp check
vp test
```

Expected: install succeeds; `vp check` passes (or only trivial template issues you fix immediately); tests pass or report zero tests.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig*.json index.html src public 2>/dev/null; git add -A
git status   # confirm docs/ and flake still present; no .env
git commit -m "chore: scaffold Vite+ React TypeScript app with pnpm"
```

---

### Task 3: Restructure layout and scripts for server + web

**Files:**
- Create: `src/web/main.tsx`, `src/web/App.tsx`, `src/web/index.css` (move from scaffold defaults)
- Modify: `index.html` (script → `/src/web/main.tsx`)
- Modify: `vite.config.ts` (root, alias `@` → `src`, server proxy `/api` → `http://127.0.0.1:8787`)
- Modify: `package.json` scripts
- Create: `src/server/.gitkeep` (placeholder until Task 12–14)

**Interfaces:**
- Consumes: Vite+ scaffold
- Produces: `vp run dev:web` starts Vite on 5173 proxying `/api`; `@/` imports resolve to `src/`

- [ ] **Step 1: Move SPA entry to `src/web/`**

Move scaffold `src/main.tsx`, `src/App.tsx`, `src/index.css`, and assets into `src/web/`. Update imports. Point `index.html` at `/src/web/main.tsx`.

- [ ] **Step 2: Configure Vite**

```ts
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
});
```

Adjust `defineConfig` import if the scaffold uses a different entry (`vite` vs `vite-plus`) — keep whatever `vp create` generated as the base and merge these options.

- [ ] **Step 3: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "vp run dev:all",
    "dev:web": "vp dev",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:all": "concurrently -k \"pnpm dev:server\" \"pnpm dev:web\"",
    "build": "vp build && tsc -p tsconfig.server.json",
    "start": "node dist/server/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "check": "vp check",
    "test": "vp test"
  }
}
```

Add deps (exact versions via `vp add` / `pnpm add`):

```bash
vp add hono @hono/node-server drizzle-orm @libsql/client croner pino dotenv
vp add -D tsx concurrently drizzle-kit @types/node pino-pretty
```

If `vp add` is unavailable, use `pnpm add` / `pnpm add -D` equivalently.

Create `tsconfig.server.json` extending the base config with `"module": "NodeNext"`, `"outDir": "dist/server"`, include `src/**/*.ts` exclude `src/web/**` and `**/*.test.ts`.

- [ ] **Step 4: Verify web still builds**

Run: `vp build`  
Expected: assets written under `dist/web/`.

- [ ] **Step 5: Commit**

```bash
git add index.html vite.config.ts package.json pnpm-lock.yaml tsconfig*.json src
git commit -m "chore: split web/server layout and add runtime dependencies"
```

---

### Task 4: Config and pino logger

**Files:**
- Create: `src/config/env.ts`
- Create: `src/logging/logger.ts`
- Create: `src/config/env.test.ts`
- Create: `.env.example`

**Interfaces:**
- Consumes: `dotenv`
- Produces:
  - `loadConfig(): AppConfig`
  - `createLogger(config: AppConfig): Logger`
  - `AppConfig` fields listed below

```ts
export type AppConfig = {
  nodeEnv: "development" | "production" | "test";
  host: string; // default "127.0.0.1"
  port: number; // default 8787
  tursoDatabaseUrl: string;
  tursoAuthToken: string | undefined;
  wareraApiBaseUrl: string; // default "https://gateway.warerastats.io/trpc"
  wareraApiKey: string | undefined;
  wareraMaxRequestsPerMinute: number; // default 120
  discordWebhookUrl: string | undefined;
  logLevel: string; // default "info"
  jobRunHistoryLimit: number; // default 50
};
```

- [ ] **Step 1: Write failing test for port parsing**

```ts
// src/config/env.test.ts
import { describe, expect, it } from "vitest";
import { parseConfig } from "./env";

describe("parseConfig", () => {
  it("defaults host/port and rate limit", () => {
    const cfg = parseConfig({
      TURSO_DATABASE_URL: "libsql://example.turso.io",
    });
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.port).toBe(8787);
    expect(cfg.wareraMaxRequestsPerMinute).toBe(120);
    expect(cfg.wareraApiBaseUrl).toBe("https://gateway.warerastats.io/trpc");
  });

  it("parses PORT override", () => {
    const cfg = parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      PORT: "9000",
    });
    expect(cfg.port).toBe(9000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/config/env.test.ts`  
Expected: FAIL — `parseConfig` not defined.

- [ ] **Step 3: Implement `parseConfig` / `loadConfig` and logger**

```ts
// src/config/env.ts
import "dotenv/config";

export type AppConfig = {
  nodeEnv: "development" | "production" | "test";
  host: string;
  port: number;
  tursoDatabaseUrl: string;
  tursoAuthToken: string | undefined;
  wareraApiBaseUrl: string;
  wareraApiKey: string | undefined;
  wareraMaxRequestsPerMinute: number;
  discordWebhookUrl: string | undefined;
  logLevel: string;
  jobRunHistoryLimit: number;
};

export function parseConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const tursoDatabaseUrl = env.TURSO_DATABASE_URL;
  if (!tursoDatabaseUrl) {
    throw new Error("TURSO_DATABASE_URL is required");
  }
  const nodeEnv = (env.NODE_ENV ?? "development") as AppConfig["nodeEnv"];
  return {
    nodeEnv,
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 8787),
    tursoDatabaseUrl,
    tursoAuthToken: env.TURSO_AUTH_TOKEN,
    wareraApiBaseUrl: env.WARERA_API_BASE_URL ?? "https://gateway.warerastats.io/trpc",
    wareraApiKey: env.WARERA_API_KEY,
    wareraMaxRequestsPerMinute: Number(env.WARERA_MAX_REQUESTS_PER_MINUTE ?? 120),
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    logLevel: env.LOG_LEVEL ?? "info",
    jobRunHistoryLimit: Number(env.JOB_RUN_HISTORY_LIMIT ?? 50),
  };
}

export function loadConfig(): AppConfig {
  return parseConfig(process.env);
}
```

```ts
// src/logging/logger.ts
import pino from "pino";
import type { AppConfig } from "../config/env";

export function createLogger(config: AppConfig) {
  return pino({
    level: config.logLevel,
    transport:
      config.nodeEnv === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
```

`.env.example`:

```env
HOST=127.0.0.1
PORT=8787
NODE_ENV=development
LOG_LEVEL=info

TURSO_DATABASE_URL=libsql://YOUR_DB.turso.io
TURSO_AUTH_TOKEN=

# Prefer gateway; fallback https://api2.warera.io/trpc
WARERA_API_BASE_URL=https://gateway.warerastats.io/trpc
# Gateway: X-API-Key. Official api2: Authorization Bearer session token.
WARERA_API_KEY=
WARERA_MAX_REQUESTS_PER_MINUTE=120

DISCORD_WEBHOOK_URL=
JOB_RUN_HISTORY_LIMIT=50
```

- [ ] **Step 4: Run tests**

Run: `vp test src/config/env.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config src/logging .env.example
git commit -m "feat: add typed config and pino logger"
```

---

### Task 5: Drizzle schema, client, migrations

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `src/db/migrate.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/` migrations (via drizzle-kit)

**Interfaces:**
- Consumes: `AppConfig.tursoDatabaseUrl`, `tursoAuthToken`
- Produces:
  - `createDb(config) => { db, client }`
  - tables: `jobs`, `jobRuns`, `cache`
  - `migrateDb(client)` applies SQL migrations

- [ ] **Step 1: Write schema**

```ts
// src/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobStatuses = ["success", "error", "running"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  cron: text("cron").notNull(),
  lastStartedAt: integer("last_started_at", { mode: "timestamp_ms" }),
  lastFinishedAt: integer("last_finished_at", { mode: "timestamp_ms" }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  state: text("state", { mode: "json" }).$type<Record<string, unknown> | null>(),
});

export const jobRuns = sqliteTable("job_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  status: text("status").notNull(),
  message: text("message"),
  durationMs: integer("duration_ms"),
});

export const cache = sqliteTable("cache", {
  key: text("key").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull(),
  tags: text("tags"),
});
```

- [ ] **Step 2: Client + drizzle config**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
```

```ts
// src/db/client.ts
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
```

```ts
// src/db/migrate.ts
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { loadConfig } from "../config/env";
import { createDb } from "./client";

export async function migrateDb(db: ReturnType<typeof createDb>["db"]) {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const { db, client } = createDb(config);
  await migrateDb(db);
  client.close();
}
```

Fix the `import.meta.url` main-guard to a reliable pattern for tsx if needed (e.g. always export `migrateDb` and use a tiny `src/db/migrate-cli.ts` as the script entry).

- [ ] **Step 3: Generate migration**

For local generation you can use a throwaway file URL:

```bash
TURSO_DATABASE_URL="file:local.db" pnpm db:generate
```

Expected: SQL files under `drizzle/`.

- [ ] **Step 4: Apply migration against a local file DB**

```bash
TURSO_DATABASE_URL="file:local.db" pnpm db:migrate
```

Expected: exits 0; `local.db` created (add `*.db` to `.gitignore`).

- [ ] **Step 5: Commit**

```bash
echo '*.db' >> .gitignore
git add src/db drizzle.config.ts drizzle .gitignore
git commit -m "feat: add Drizzle schema and Turso migrations"
```

---

### Task 6: Cache helpers

**Files:**
- Create: `src/db/cache.ts`
- Create: `src/db/cache.test.ts`

**Interfaces:**
- Consumes: `Db`, `cache` table
- Produces:
  - `isCacheFresh(fetchedAt: Date, ttlSeconds: number, now?: Date): boolean`
  - `getCached<T>(db, key): Promise<T | null>`
  - `setCached(db, key, payload, ttlSeconds, tags?): Promise<void>`
  - `getOrFetch<T>(db, key, ttlSeconds, fetcher, tags?): Promise<T>`

- [ ] **Step 1: Write failing freshness tests**

```ts
// src/db/cache.test.ts
import { describe, expect, it } from "vitest";
import { isCacheFresh } from "./cache";

describe("isCacheFresh", () => {
  it("is fresh inside TTL", () => {
    const fetchedAt = new Date("2026-07-31T12:00:00.000Z");
    const now = new Date("2026-07-31T12:00:30.000Z");
    expect(isCacheFresh(fetchedAt, 60, now)).toBe(true);
  });

  it("is stale after TTL", () => {
    const fetchedAt = new Date("2026-07-31T12:00:00.000Z");
    const now = new Date("2026-07-31T12:02:00.000Z");
    expect(isCacheFresh(fetchedAt, 60, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `vp test src/db/cache.test.ts`

- [ ] **Step 3: Implement cache module**

```ts
// src/db/cache.ts
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { cache } from "./schema";

export function isCacheFresh(fetchedAt: Date, ttlSeconds: number, now = new Date()): boolean {
  return now.getTime() < fetchedAt.getTime() + ttlSeconds * 1000;
}

export async function getCached<T>(db: Db, key: string): Promise<T | null> {
  const rows = await db.select().from(cache).where(eq(cache.key, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!isCacheFresh(row.fetchedAt as Date, row.ttlSeconds)) return null;
  return row.payload as T;
}

export async function setCached(
  db: Db,
  key: string,
  payload: unknown,
  ttlSeconds: number,
  tags?: string,
): Promise<void> {
  await db
    .insert(cache)
    .values({
      key,
      payload,
      fetchedAt: new Date(),
      ttlSeconds,
      tags: tags ?? null,
    })
    .onConflictDoUpdate({
      target: cache.key,
      set: {
        payload,
        fetchedAt: new Date(),
        ttlSeconds,
        tags: tags ?? null,
      },
    });
}

export async function getOrFetch<T>(
  db: Db,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  tags?: string,
): Promise<T> {
  const hit = await getCached<T>(db, key);
  if (hit !== null) return hit;
  const value = await fetcher();
  await setCached(db, key, value, ttlSeconds, tags);
  return value;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `vp test src/db/cache.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/db/cache.ts src/db/cache.test.ts
git commit -m "feat: add cache get/set/getOrFetch helpers"
```

---

### Task 7: WarEra rate limiter

**Files:**
- Create: `src/warera/rate-limit.ts`
- Create: `src/warera/rate-limit.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `createRateLimiter({ maxPerMinute: number, now?: () => number, sleep?: (ms) => Promise<void> })` with `acquire(): Promise<void>`

Behavior: sliding window of 60s; if at capacity, wait until the oldest request exits the window, then record. Prefer waiting over throwing.

- [ ] **Step 1: Write failing tests with fake timers/sleep**

```ts
// src/warera/rate-limit.test.ts
import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows bursts up to maxPerMinute without waiting", async () => {
    const sleep = vi.fn(async () => {});
    let t = 0;
    const limiter = createRateLimiter({
      maxPerMinute: 2,
      now: () => t,
      sleep,
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits when capacity is exhausted", async () => {
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    let t = 1_000;
    const limiter = createRateLimiter({
      maxPerMinute: 1,
      now: () => t,
      sleep,
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(sleep).toHaveBeenCalled();
    expect(sleep.mock.calls[0]![0]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `vp test src/warera/rate-limit.test.ts`

- [ ] **Step 3: Implement limiter**

```ts
// src/warera/rate-limit.ts
export type RateLimiterOptions = {
  maxPerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createRateLimiter(options: RateLimiterOptions) {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const timestamps: number[] = [];
  const windowMs = 60_000;

  async function acquire(): Promise<void> {
    for (;;) {
      const t = now();
      while (timestamps.length && t - timestamps[0]! >= windowMs) {
        timestamps.shift();
      }
      if (timestamps.length < options.maxPerMinute) {
        timestamps.push(t);
        return;
      }
      const waitMs = windowMs - (t - timestamps[0]!) + 1;
      await sleep(waitMs);
    }
  }

  return { acquire };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `vp test src/warera/rate-limit.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/warera/rate-limit.ts src/warera/rate-limit.test.ts
git commit -m "feat: add WarEra request rate limiter"
```

---

### Task 8: WarEra HTTP client

**Files:**
- Create: `src/warera/client.ts`
- Create: `src/warera/index.ts`
- Create: `src/warera/client.test.ts` (mock `fetch`)

**Interfaces:**
- Consumes: `AppConfig`, `Logger`, `createRateLimiter`
- Produces: `createWareraClient({ config, logger })` with:
  - `request<T>(path: string, init?: RequestInit & { skipRateLimit?: boolean }): Promise<T>`
  - GET retries: up to 2 retries on network error or HTTP 502/503/504 only; no retry on POST/PUT/PATCH/DELETE

- [ ] **Step 1: Write failing test for GET retry on 503**

```ts
// src/warera/client.test.ts
import { describe, expect, it, vi } from "vitest";
import { createWareraClient } from "./client";
import type { AppConfig } from "../config/env";

const baseConfig = {
  wareraApiBaseUrl: "https://gateway.warerastats.io/trpc",
  wareraApiKey: "test-key",
  wareraMaxRequestsPerMinute: 1000,
} as AppConfig;

describe("createWareraClient", () => {
  it("retries GET on 503 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createWareraClient({
      config: baseConfig,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn() }) } as never,
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    const result = await client.request<{ ok: boolean }>("/v1/ping");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `vp test src/warera/client.test.ts`

- [ ] **Step 3: Implement client**

Implement `createWareraClient` that:
- Joins `wareraApiBaseUrl` + path (base should include `/trpc`)
- When key present: `X-API-Key` if base host is `gateway.warerastats.io`, else `Authorization: Bearer`
- Calls `rateLimiter.acquire()` unless `skipRateLimit`
- Logs `{ path, status, durationMs }` via pino
- Throws on final non-OK response with status + body snippet

```ts
// src/warera/index.ts
export { createWareraClient } from "./client";
export { createRateLimiter } from "./rate-limit";
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `vp test src/warera/client.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/warera
git commit -m "feat: add WarEra HTTP client with retries and rate limiting"
```

---

### Task 9: Discord webhook notifier

**Files:**
- Create: `src/discord/notify.ts`
- Create: `src/discord/index.ts`
- Create: `src/discord/notify.test.ts`

**Interfaces:**
- Consumes: `discordWebhookUrl`, `Logger`
- Produces: `createDiscordNotifier({ webhookUrl, logger, fetchImpl? })` with  
  `notify({ title, body, severity? }: { title: string; body: string; severity?: "info" | "warn" | "error" }): Promise<void>`  
  If `webhookUrl` is missing, log a warning and return (no throw).

- [ ] **Step 1: Write failing test**

```ts
// src/discord/notify.test.ts
import { describe, expect, it, vi } from "vitest";
import { createDiscordNotifier } from "./notify";

describe("createDiscordNotifier", () => {
  it("posts an embed-like content payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const notifier = createDiscordNotifier({
      webhookUrl: "https://discord.com/api/webhooks/test",
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never,
      fetchImpl,
    });
    await notifier.notify({ title: "Hello", body: "World", severity: "info" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body.content).toContain("Hello");
    expect(body.content).toContain("World");
  });

  it("no-ops when webhook missing", async () => {
    const fetchImpl = vi.fn();
    const warn = vi.fn();
    const notifier = createDiscordNotifier({
      webhookUrl: undefined,
      logger: { warn, error: vi.fn(), info: vi.fn() } as never,
      fetchImpl,
    });
    await notifier.notify({ title: "x", body: "y" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `vp test src/discord/notify.test.ts`

- [ ] **Step 3: Implement notifier**

POST JSON `{ content: "**title**\nbody" }` (keep simple; embeds optional later). On non-OK, log error with status.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/discord
git commit -m "feat: add Discord webhook notifier"
```

---

### Task 10: Job types, registry, runner, prune

**Files:**
- Create: `src/jobs/types.ts`
- Create: `src/jobs/registry.ts`
- Create: `src/jobs/runner.ts`
- Create: `src/jobs/prune.ts`
- Create: `src/jobs/resolve-cron.ts`
- Create: `src/jobs/resolve-cron.test.ts`
- Create: `src/jobs/example-heartbeat/index.ts`

**Interfaces:**
- Consumes: `Db`, `Logger`
- Produces:

```ts
export type JobDefinition = {
  id: string;
  name: string;
  description: string;
  defaultCron: string; // 6-field cron
  defaultEnabled?: boolean;
  run: (ctx: JobContext) => Promise<string | void>;
};

export type JobContext = {
  db: Db;
  logger: Logger;
  state: Record<string, unknown> | null;
  setState: (state: Record<string, unknown> | null) => Promise<void>;
};

export function listJobDefinitions(): JobDefinition[];
export async function syncJobsToDb(db: Db, defs: JobDefinition[]): Promise<void>;
export function resolveCron(dbCron: string | null | undefined, defaultCron: string, logger: Logger): string;
export async function runJob(db: Db, logger: Logger, def: JobDefinition, opts?: { force?: boolean }): Promise<void>;
export async function pruneJobRuns(db: Db, jobId: string, keep: number): Promise<void>;
```

`syncJobsToDb`: upsert by `id` — set `name`, `description`; on insert set `cron = defaultCron`, `enabled = defaultEnabled ?? true`; on conflict **do not** overwrite `enabled`, `cron`, `state`, or last-run fields.

`runJob`: if `lastStatus === "running"` and not stale, skip (unless designing a stale timeout — use 30 minutes stale → allow restart). Insert `job_runs` row, set job running, call `def.run`, finalize success/error, prune history.

`resolveCron`: try `new Cron(dbCron)`; on throw, warn and return `defaultCron`.

- [ ] **Step 1: Write failing `resolveCron` tests**

```ts
// src/jobs/resolve-cron.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolveCron } from "./resolve-cron";

describe("resolveCron", () => {
  it("returns db cron when valid", () => {
    const logger = { warn: vi.fn() } as never;
    expect(resolveCron("0 */5 * * * *", "0 * * * * *", logger)).toBe("0 */5 * * * *");
  });

  it("falls back on invalid db cron", () => {
    const warn = vi.fn();
    expect(resolveCron("not-a-cron", "0 * * * * *", { warn } as never)).toBe("0 * * * * *");
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `vp test src/jobs/resolve-cron.test.ts`

- [ ] **Step 3: Implement types, resolveCron, registry, runner, prune, heartbeat**

Heartbeat job:

```ts
// src/jobs/example-heartbeat/index.ts
import type { JobDefinition } from "../types";

export const exampleHeartbeatJob: JobDefinition = {
  id: "example-heartbeat",
  name: "Example Heartbeat",
  description: "Logs a heartbeat to prove the scheduler wiring",
  defaultCron: "0 * * * * *", // every minute at second 0
  async run({ logger }) {
    logger.info({ jobId: "example-heartbeat" }, "heartbeat");
    return "ok";
  },
};
```

`listJobDefinitions()` returns `[exampleHeartbeatJob]`.

- [ ] **Step 4: Run unit tests — expect PASS**

Run: `vp test src/jobs/resolve-cron.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/jobs
git commit -m "feat: add job registry, runner, and heartbeat job"
```

---

### Task 11: Croner scheduler

**Files:**
- Create: `src/jobs/scheduler.ts`
- Create: `src/jobs/index.ts`

**Interfaces:**
- Consumes: `listJobDefinitions`, `resolveCron`, `runJob`, `Db`, `Logger`
- Produces: `startScheduler({ db, logger }): { stop: () => void }`

Behavior:
- Load each definition; read DB row for `enabled` + `cron`
- If disabled, skip scheduling
- `new Cron(resolvedCron, { protect: true }, () => { void runJob(...) })`
- `stop()` calls `.stop()` on all Croner instances
- On restart: schedule from now (no missed-tick replay)

- [ ] **Step 1: Implement scheduler**

```ts
// src/jobs/scheduler.ts
import { Cron } from "croner";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs } from "../db/schema";
import type { Logger } from "../logging/logger";
import { listJobDefinitions } from "./registry";
import { resolveCron } from "./resolve-cron";
import { runJob } from "./runner";
import type { JobDefinition } from "./types";

export type SchedulerHandle = {
  stop: () => void;
  reloadJob: (jobId: string) => Promise<void>;
};

export function startScheduler(deps: { db: Db; logger: Logger }): SchedulerHandle {
  const { db, logger } = deps;
  const defs = new Map(listJobDefinitions().map((d) => [d.id, d]));
  const crons = new Map<string, Cron>();

  async function scheduleOne(def: JobDefinition): Promise<void> {
    const existing = crons.get(def.id);
    if (existing) {
      existing.stop();
      crons.delete(def.id);
    }

    const rows = await db.select().from(jobs).where(eq(jobs.id, def.id)).limit(1);
    const row = rows[0];
    if (!row || !row.enabled) {
      logger.info({ jobId: def.id }, "job not scheduled (missing or disabled)");
      return;
    }

    const cronExpr = resolveCron(row.cron, def.defaultCron, logger);
    const jobCron = new Cron(
      cronExpr,
      { protect: true, name: def.id },
      () => {
        void runJob(db, logger, def).catch((err) => {
          logger.error({ err, jobId: def.id }, "unhandled job error");
        });
      },
    );
    crons.set(def.id, jobCron);
    logger.info({ jobId: def.id, cron: cronExpr, next: jobCron.nextRun() }, "job scheduled");
  }

  for (const def of defs.values()) {
    void scheduleOne(def);
  }

  return {
    stop() {
      for (const c of crons.values()) c.stop();
      crons.clear();
    },
    async reloadJob(jobId: string) {
      const def = defs.get(jobId);
      if (!def) {
        logger.warn({ jobId }, "reloadJob: unknown job");
        return;
      }
      await scheduleOne(def);
    },
  };
}
```

```ts
// src/jobs/index.ts
export { listJobDefinitions, syncJobsToDb } from "./registry";
export { runJob } from "./runner";
export { startScheduler } from "./scheduler";
export type { SchedulerHandle } from "./scheduler";
export type { JobDefinition, JobContext } from "./types";
```

Note: `startScheduler` fires `scheduleOne` without awaiting in the loop so boot is not blocked; `reloadJob` awaits. If you prefer stricter boot, `await Promise.all([...defs.values()].map(scheduleOne))` inside an `async` `startScheduler` and adjust the server entry accordingly — either is acceptable if documented in code.

- [ ] **Step 2: Manual smoke (local file DB)**

```bash
cat > .env <<'EOF'
TURSO_DATABASE_URL=file:local.db
LOG_LEVEL=debug
EOF
# temporary smoke entry can wait until Task 14; if scheduler is testable via a small script, run it for 65s and confirm a job_runs row
```

If full smoke waits for Task 14, skip long wait here but keep `startScheduler` exported and typecheck-clean.

- [ ] **Step 3: Commit**

```bash
git add src/jobs/scheduler.ts src/jobs/index.ts
git commit -m "feat: add Croner-based job scheduler"
```

---

### Task 12: Hono API (health + jobs admin)

**Files:**
- Create: `src/server/errors.ts`
- Create: `src/server/middleware/auth-placeholder.ts`
- Create: `src/server/routes/health.ts`
- Create: `src/server/routes/jobs.ts`
- Create: `src/server/app.ts`

**Interfaces:**
- Consumes: `Db`, `Logger`, `SchedulerHandle`, job modules
- Produces: `createApp(deps): Hono` with routes:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/jobs` | list jobs + last status fields |
| GET | `/api/jobs/:id/runs` | recent runs (limit query, default 20) |
| PATCH | `/api/jobs/:id` | body `{ enabled?: boolean, cron?: string }` then `scheduler.reloadJob(id)` |
| POST | `/api/jobs/:id/run` | `runJob(..., { force: true })` — force still respects in-memory overlap if currently running |

Error shape: `{ error: { code: string, message: string } }` with appropriate HTTP status.

`authPlaceholder` middleware: no-op `await next()`; comment marks BetterAuth insertion point. Mount it on `/api/*` except `/api/health`.

- [ ] **Step 1: Implement errors + middleware + routes + `createApp`**

```ts
// src/server/errors.ts
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorPayload(err: unknown) {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Internal Server Error" } },
  };
}
```

Wire Hono `onError` to log unexpected errors and return `errorPayload`.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc -p tsconfig.server.json --noEmit` (or `vp check`)  
Expected: no errors in server files.

- [ ] **Step 3: Commit**

```bash
git add src/server
git commit -m "feat: add Hono health and jobs admin API"
```

---

### Task 13: React WebUI — shell, dashboard, jobs

**Files:**
- Modify: `src/web/App.tsx`
- Create: `src/web/api.ts`
- Create: `src/web/layout/Shell.tsx`
- Create: `src/web/features/dashboard/DashboardPage.tsx`
- Create: `src/web/features/jobs/JobsPage.tsx`
- Create: `src/web/features/jobs/types.ts`

**Interfaces:**
- Consumes: `/api/*` JSON
- Produces: tabs for Dashboard + Jobs; Jobs page can list, toggle enabled, run now, show recent runs

Keep styling minimal functional CSS in `src/web/index.css` (no marketing landing page).

- [ ] **Step 1: Add API helper**

```ts
// src/web/api.ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Build Shell + pages**

- `Shell`: nav links Dashboard / Jobs
- `DashboardPage`: short placeholder text
- `JobsPage`: table of jobs; Enable/Disable button; Run now; expand/select to load runs from `/api/jobs/:id/runs`

Use simple `useEffect` + `useState` (no router package required — tab state in React state or hash). If you prefer `react-router`, add it with `vp add react-router`; otherwise tab state is enough for foundation.

- [ ] **Step 3: Verify Vite build**

Run: `vp build`  
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/web
git commit -m "feat: add WebUI shell with jobs admin tab"
```

---

### Task 14: Server entry, static files, graceful shutdown

**Files:**
- Create: `src/server/index.ts`
- Modify: `src/server/app.ts` if needed to serve `dist/web` in production
- Modify: `README.md`, `.env.example` if gaps remain

**Interfaces:**
- Consumes: all prior modules
- Produces: runnable process lifecycle per design spec

- [ ] **Step 1: Implement `src/server/index.ts`**

Order:
1. `loadConfig()`
2. `createLogger(config)`
3. `createDb(config)`
4. `migrateDb(db)`
5. `syncJobsToDb(db, listJobDefinitions())`
6. `createWareraClient` + `createDiscordNotifier` (attach on `app` deps if needed later; construct even if unused beyond readiness)
7. `const scheduler = startScheduler({ db, logger })`
8. `const app = createApp({ db, logger, scheduler, config })`
9. Serve static from `dist/web` when `NODE_ENV=production` (use Hono static serve); in development API-only is fine (Vite serves UI)
10. `serve({ fetch: app.fetch, hostname: config.host, port: config.port })` from `@hono/node-server`
11. SIGINT/SIGTERM: `scheduler.stop()`, close DB client, exit

- [ ] **Step 2: End-to-end smoke**

```bash
# terminal A
TURSO_DATABASE_URL=file:local.db pnpm dev:server
# terminal B
pnpm dev:web
```

Verify:
- `curl http://127.0.0.1:8787/api/health` → `{"ok":true}`
- `curl http://127.0.0.1:8787/api/jobs` → includes `example-heartbeat`
- `curl -X POST http://127.0.0.1:8787/api/jobs/example-heartbeat/run` → success
- Jobs tab in browser at `http://127.0.0.1:5173` shows the job and history
- Restart server; `last_finished_at` still present in GET `/api/jobs`

- [ ] **Step 3: Run full check + tests**

```bash
vp check
vp test
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/server README.md
git commit -m "feat: wire server entry, static UI, and graceful shutdown"
```

---

### Task 15: README polish and foundation acceptance

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Expand README with**
  - Prerequisites (Nix/direnv, `vp`, Turso DB)
  - Env vars (point at `.env.example`)
  - `pnpm dev` / `vp run dev` workflow
  - `vp check` / `vp test`
  - WarEra API: prefer gateway `/trpc`, fallback api2 `/trpc`; official allowlist + auth notes
  - Link to design spec and `.agents/skills/warera-api/SKILL.md`

- [ ] **Step 2: Final verification checklist**

Confirm design success criteria:

1. devenv + Vite+/pnpm install and run locally  
2. Turso/file DB migrates; heartbeat job persists last-run across restart  
3. WebUI Jobs tab: status, history, enable/disable, run now  
4. WarEra client + rate limit + cache helpers present  
5. Discord notifier callable when webhook configured  
6. `vp check` passes  
7. Git history has design + implementation commits  

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document foundation setup and usage"
```

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Single process API + SPA + scheduler | 3, 11, 14 |
| Single package modular folders | 3, 10, 13 |
| Vite+ fmt/lint/test | 2, 15 |
| pnpm preferred | 1–2 |
| Turso + Drizzle + migrations | 5 |
| jobs / job_runs / cache tables | 5–6 |
| Cron with seconds (Croner) | 10–11 |
| Persist last-run; no missed-tick replay | 10–11 |
| Job-owned state JSON | 5, 10 |
| example-heartbeat | 10 |
| Jobs admin API + WebUI | 12–13 |
| WarEra client + rate limit + cache | 6–8 |
| Discord webhook | 9 |
| pino console logger | 4 |
| No auth + BetterAuth hook | 12 |
| Localhost default | 4, 14 |
| flake + devenv | 1 |
| Graceful shutdown | 14 |
| Vitest for pure units | 4, 6, 7, 8, 9, 10 |
| Out of scope left out | — |

## Placeholder / consistency notes

- WarEra auth header assumed `Bearer` until live probing — documented in Task 8; adjust in a later feature task when confirmed.
- Scheduler reload on PATCH is required so enable/disable works without full process restart.
- `file:local.db` is allowed for local smoke; production path is Turso cloud URLs from `.env`.
