# tslog Migration & Logging Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace pino with tslog v5, add structured HTTP/access logging, secret-masking and file-log env plumbing, browser `api` logging, light level retags, and AGENTS.md logging guidance.

**Architecture:** Narrow `Logger` interface + `createServerLogger` (full tslog, optional file transport/masking) and `createBrowserLogger` (`tslog/lite`). Hono middleware logs `/api/*` access. Existing DI keeps injecting `Logger`.

**Tech Stack:** tslog@5.1.0, Hono, Vitest via `vp test`, Vite+ (`vp check` / `vp add` / `vp remove`)

**Design:** [2026-08-02-tslog-migration-design.md](../specs/2026-08-02-tslog-migration-design.md)

## Global Constraints

- Library: tslog v5 (install `tslog@^5.1.0`); remove `pino` and `pino-pretty`
- Server: full `tslog` `Logger`; browser: `tslog/lite` via `createLiteLogger`
- Pretty in non-production; `type: "json"` when `nodeEnv === "production"`
- Masking default: on in production, off in development/test; override `LOG_MASK_SECRETS`
- File sink: only when `LOG_FILE` is set (JSON `fileTransport`)
- Incoming HTTP: `/api/*` only; 2xx/3xx → `debug`, 4xx → `warn`, 5xx → `error`
- Prefer structured fields + short message; light-retag chatty success `info` → `debug`
- Prefer `vp test` / `vp check` for verification; commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/logging/types.ts` | Narrow `Logger` / `LogFn` for DI + tests |
| `src/logging/mask.ts` | Secret key list + `resolveMaskEnabled` |
| `src/logging/createServerLogger.ts` | Server tslog factory (+ file transport) |
| `src/logging/createBrowserLogger.ts` | Browser `tslog/lite` factory |
| `src/logging/httpAccess.ts` | Hono `/api/*` access middleware |
| `src/logging/logger.ts` | Re-export `createLogger` (= server) + `Logger` |
| `src/logging/*.test.ts` | Unit tests for mask, factory, httpAccess |
| `src/config/env.ts` | `logMaskSecrets`, `logFile` fields |
| `src/config/env.test.ts` | Config parsing tests |
| `src/server/app.ts` | Mount `httpAccess`; fix `{ err }` logging |
| `src/warera/client.ts` | Success request logs → `debug` |
| `src/jobs/example-heartbeat/index.ts` | Heartbeat → `debug` |
| `src/jobs/scheduler.ts` / `runner.ts` / `resolve-cron.ts` | `{ err }` → Error-friendly logging |
| `src/web/logger.ts` | Browser logger singleton |
| `src/web/api.ts` | Outbound API structured logs |
| `src/web/api.test.ts` | Assert logging on success/failure |
| `AGENTS.md` | Logging guidance section |
| `.env.example` | Document `LOG_MASK_SECRETS`, `LOG_FILE` |
| `package.json` | Depend on `tslog`; drop pino packages |

---

### Task 1: Config for mask + file path

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/config/env.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: existing `parseConfig` / `AppConfig`
- Produces:
  - `AppConfig.logMaskSecrets: boolean`
  - `AppConfig.logFile: string | undefined`
  - Defaults: `logMaskSecrets` true iff `nodeEnv === "production"` unless `LOG_MASK_SECRETS` is `"true"`/`"false"`; `logFile` from `LOG_FILE` or `undefined`

- [ ] **Step 1: Write failing tests**

Add to `src/config/env.test.ts`:

```ts
it("defaults logMaskSecrets on in production and off otherwise", () => {
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "production",
    }).logMaskSecrets,
  ).toBe(true);
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "development",
    }).logMaskSecrets,
  ).toBe(false);
});

it("honors LOG_MASK_SECRETS override", () => {
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "production",
      LOG_MASK_SECRETS: "false",
    }).logMaskSecrets,
  ).toBe(false);
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "development",
      LOG_MASK_SECRETS: "true",
    }).logMaskSecrets,
  ).toBe(true);
});

it("parses optional LOG_FILE", () => {
  expect(
    parseConfig({ TURSO_DATABASE_URL: "file:test.db" }).logFile,
  ).toBeUndefined();
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      LOG_FILE: "logs/app.log",
    }).logFile,
  ).toBe("logs/app.log");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/config/env.test.ts`

Expected: FAIL — `logMaskSecrets` / `logFile` missing on `AppConfig`

- [ ] **Step 3: Implement config fields**

In `src/config/env.ts`, extend `AppConfig` and `parseConfig`:

```ts
export type AppConfig = {
  // ...existing fields...
  logLevel: string;
  logMaskSecrets: boolean;
  logFile: string | undefined;
  jobRunHistoryLimit: number;
};

function parseBoolEnv(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === "") return defaultValue;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return defaultValue;
}

// inside parseConfig return:
logLevel: env.LOG_LEVEL ?? "info",
logMaskSecrets: parseBoolEnv(
  env.LOG_MASK_SECRETS,
  nodeEnv === "production",
),
logFile: env.LOG_FILE || undefined,
```

Update `.env.example`:

```env
LOG_LEVEL=info
# Optional override; default on in production, off in development/test
# LOG_MASK_SECRETS=false
# Optional JSON file sink (unset = console only)
# LOG_FILE=logs/app.log
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/config/env.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat(config): add LOG_MASK_SECRETS and LOG_FILE settings

Prepare env plumbing for tslog masking and optional file sinks.

EOF
)"
```

---

### Task 2: Server logger factory + swap pino for tslog

**Files:**
- Create: `src/logging/types.ts`
- Create: `src/logging/mask.ts`
- Create: `src/logging/createServerLogger.ts`
- Create: `src/logging/createServerLogger.test.ts`
- Modify: `src/logging/logger.ts`
- Modify: `package.json` (via `vp add` / `vp remove`)

**Interfaces:**
- Consumes: `AppConfig` (`logLevel`, `logMaskSecrets`, `logFile`, `nodeEnv`)
- Produces:
  - `export type LogFn = (...args: unknown[]) => void`
  - `export type Logger = { silly: LogFn; trace: LogFn; debug: LogFn; info: LogFn; warn: LogFn; error: LogFn; fatal: LogFn; child: (opts?: { name?: string; bindings?: Record<string, unknown> }) => Logger }`
  - `export const MASK_KEYS: string[]` — keys listed in the design
  - `export function resolveMaskEnabled(config: Pick<AppConfig, "logMaskSecrets">): boolean`
  - `export function createServerLogger(config: AppConfig): Logger`
  - `export function createLogger(config: AppConfig): Logger` — alias of `createServerLogger` from `logger.ts`
  - `export type { Logger } from "./types"` from `logger.ts`

- [ ] **Step 1: Install tslog; remove pino**

```bash
vp add tslog@^5.1.0
vp remove pino pino-pretty
```

- [ ] **Step 2: Write failing factory tests**

`src/logging/createServerLogger.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { AppConfig } from "../config/env";
import { createServerLogger } from "./createServerLogger";
import { MASK_KEYS, resolveMaskEnabled } from "./mask";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 8787,
    tursoDatabaseUrl: "file:test.db",
    tursoAuthToken: undefined,
    wareraApiBaseUrl: "https://gateway.warerastats.io/trpc",
    wareraApiKey: undefined,
    wareraMaxRequestsPerMinute: 120,
    discordWebhookUrl: undefined,
    logLevel: "info",
    logMaskSecrets: false,
    logFile: undefined,
    jobRunHistoryLimit: 50,
    ...overrides,
  };
}

describe("resolveMaskEnabled", () => {
  it("follows config.logMaskSecrets", () => {
    expect(resolveMaskEnabled(baseConfig({ logMaskSecrets: true }))).toBe(true);
    expect(resolveMaskEnabled(baseConfig({ logMaskSecrets: false }))).toBe(false);
  });
});

describe("createServerLogger", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("exposes level methods and child", () => {
    const logger = createServerLogger(baseConfig({ logLevel: "debug" }));
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.child({ name: "x" }).info).toBe("function");
  });

  it("masks configured keys when logMaskSecrets is true", async () => {
    const logger = createServerLogger(
      baseConfig({
        nodeEnv: "production",
        logMaskSecrets: true,
        logLevel: "info",
        logFile: undefined,
      }),
    );
    // Use a ring/spy via child + type hidden is hard; assert mask keys exist and
    // logging a secret field does not throw. Stronger assert: write JSON file.
    const dir = mkdtempSync(join(tmpdir(), "warera-log-"));
    dirs.push(dir);
    const path = join(dir, "app.ndjson");
    const fileLogger = createServerLogger(
      baseConfig({
        nodeEnv: "production",
        logMaskSecrets: true,
        logLevel: "info",
        logFile: path,
      }),
    );
    fileLogger.info({ apiKey: "super-secret", path: "/x" }, "masked sample");
    await (fileLogger as { flush?: () => Promise<void> }).flush?.();
    // Allow transport drain
    await new Promise((r) => setTimeout(r, 50));
    const body = readFileSync(path, "utf8");
    expect(body).toContain("masked sample");
    expect(body).not.toContain("super-secret");
    expect(MASK_KEYS).toContain("apiKey");
  });

  it("writes JSON lines to LOG_FILE when set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "warera-log-"));
    dirs.push(dir);
    const path = join(dir, "app.ndjson");
    const logger = createServerLogger(
      baseConfig({
        nodeEnv: "production",
        logMaskSecrets: false,
        logFile: path,
      }),
    );
    logger.info({ ok: true }, "file sink");
    await (logger as { flush?: () => Promise<void> }).flush?.();
    await new Promise((r) => setTimeout(r, 50));
    const body = readFileSync(path, "utf8");
    expect(body).toContain("file sink");
    expect(body).toContain('"ok":true');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `vp test src/logging/createServerLogger.test.ts`

Expected: FAIL — modules missing

- [ ] **Step 4: Implement logging modules**

`src/logging/types.ts`:

```ts
export type LogFn = (...args: unknown[]) => void;

export type Logger = {
  silly: LogFn;
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child: (opts?: { name?: string; bindings?: Record<string, unknown> }) => Logger;
  /** Present on server loggers; used in tests / shutdown. */
  flush?: () => Promise<void>;
};
```

`src/logging/mask.ts`:

```ts
import type { AppConfig } from "../config/env";

export const MASK_KEYS = [
  "authorization",
  "apiKey",
  "token",
  "password",
  "cookie",
  "WARERA_API_KEY",
  "TURSO_AUTH_TOKEN",
  "DISCORD_WEBHOOK_URL",
] as const;

export function resolveMaskEnabled(
  config: Pick<AppConfig, "logMaskSecrets">,
): boolean {
  return config.logMaskSecrets;
}
```

`src/logging/createServerLogger.ts`:

```ts
import { Logger as TsLogger } from "tslog";
import { fileTransport } from "tslog/transports/file";
import type { AppConfig } from "../config/env";
import { MASK_KEYS, resolveMaskEnabled } from "./mask";
import type { Logger } from "./types";

function toMinLevel(level: string): string {
  return level.trim().toUpperCase();
}

function adapt(log: TsLogger<unknown>): Logger {
  return {
    silly: (...args) => {
      log.silly(...args);
    },
    trace: (...args) => {
      log.trace(...args);
    },
    debug: (...args) => {
      log.debug(...args);
    },
    info: (...args) => {
      log.info(...args);
    },
    warn: (...args) => {
      log.warn(...args);
    },
    error: (...args) => {
      log.error(...args);
    },
    fatal: (...args) => {
      log.fatal(...args);
    },
    child: (opts) =>
      adapt(
        log.getSubLogger({
          name: opts?.name,
          bindings: opts?.bindings,
        }),
      ),
    flush: () => log.flush(),
  };
}

export function createServerLogger(config: AppConfig): Logger {
  const maskOn = resolveMaskEnabled(config);
  const log = new TsLogger({
    name: "warera",
    minLevel: toMinLevel(config.logLevel) as never,
    type: config.nodeEnv === "production" ? "json" : undefined,
    mask: maskOn
      ? { keys: [...MASK_KEYS], caseInsensitive: true, placeholder: "[***]" }
      : undefined,
  });

  if (config.logFile) {
    log.attachTransport(
      fileTransport({ path: config.logFile, format: "json", append: true }),
    );
  }

  return adapt(log);
}
```

Replace `src/logging/logger.ts`:

```ts
import type { AppConfig } from "../config/env";
import { createServerLogger } from "./createServerLogger";
import type { Logger } from "./types";

export type { Logger } from "./types";

export function createLogger(config: AppConfig): Logger {
  return createServerLogger(config);
}
```

If `minLevel` typing rejects lowercase-mapped strings, cast carefully or map known levels (`trace`→`TRACE`, etc.). Prefer uppercase from `toMinLevel`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp test src/logging/createServerLogger.test.ts`

Expected: PASS (if file transport timing flakes, increase short wait or `await log.flush()` on the underlying instance — expose `flush` on adapter as above)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/logging/
git commit -m "$(cat <<'EOF'
feat(logging): replace pino with tslog server factory

Add narrow Logger type, masking keys, and optional file transport.

EOF
)"
```

---

### Task 3: Incoming HTTP access middleware

**Files:**
- Create: `src/logging/httpAccess.ts`
- Create: `src/logging/httpAccess.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Consumes: `Logger` from `src/logging/types.ts`
- Produces: `export function httpAccess(logger: Logger): MiddlewareHandler` (Hono)
- Mount: `app.use("/api/*", httpAccess(deps.logger))` early in `createApp` (before routes; after `app` creation is fine — place before auth middleware)

- [ ] **Step 1: Write failing tests**

`src/logging/httpAccess.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it, vi } from "vite-plus/test";
import { httpAccess } from "./httpAccess";
import type { Logger } from "./types";

function mockLogger() {
  const child = {
    silly: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  child.child.mockReturnValue(child);
  const logger = {
    ...child,
    child: vi.fn(() => child),
  } satisfies Logger;
  return { logger, child };
}

describe("httpAccess", () => {
  it("logs 2xx at debug with structured fields", async () => {
    const { logger, child } = mockLogger();
    const app = new Hono();
    app.use("/api/*", httpAccess(logger));
    app.get("/api/health", (c) => c.json({ ok: true }));

    await app.request("/api/health");

    expect(child.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/api/health",
        status: 200,
        durationMs: expect.any(Number),
        requestId: expect.any(String),
      }),
      "http request",
    );
  });

  it("logs 4xx at warn and 5xx at error", async () => {
    const { logger, child } = mockLogger();
    const app = new Hono();
    app.use("/api/*", httpAccess(logger));
    app.get("/api/nope", (c) => c.json({ error: "x" }, 404));
    app.get("/api/boom", (c) => c.json({ error: "x" }, 500));

    await app.request("/api/nope");
    expect(child.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
      "http request",
    );

    await app.request("/api/boom");
    expect(child.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      "http request",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/logging/httpAccess.test.ts`

Expected: FAIL — `httpAccess` missing

- [ ] **Step 3: Implement middleware and mount**

`src/logging/httpAccess.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import type { Logger } from "./types";

export function httpAccess(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    const reqLog = logger.child({
      name: "http",
      bindings: { requestId },
    });

    await next();

    const status = c.res.status;
    const fields = {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Math.round(performance.now() - started),
      requestId,
    };

    if (status >= 500) {
      reqLog.error(fields, "http request");
    } else if (status >= 400) {
      reqLog.warn(fields, "http request");
    } else {
      reqLog.debug(fields, "http request");
    }
  };
}
```

In `src/server/app.ts`:

```ts
import { httpAccess } from "../logging/httpAccess";

export function createApp(deps: CreateAppDeps): Hono {
  const app = new Hono();

  app.use("/api/*", httpAccess(deps.logger));

  app.onError((err, c) => {
    if (!(err instanceof HttpError)) {
      deps.logger.error(err, "unhandled request error");
    }
    // ...
  });
  // ...rest unchanged
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/logging/httpAccess.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logging/httpAccess.ts src/logging/httpAccess.test.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
feat(server): add structured /api HTTP access logs

Log method, path, status, duration, and requestId via tslog levels.

EOF
)"
```

---

### Task 4: Light retag + Error-friendly call sites

**Files:**
- Modify: `src/warera/client.ts` — successful / routine `"warera request"` lines: `info` → `debug` (keep gateway-miss / failure paths as `info` or `warn` if they aid ops; prefer `debug` for all status lines that are not actionable failures, `warn` only if useful)
- Modify: `src/warera/client.test.ts` — expect `logger.debug` for the success log assertion
- Modify: `src/jobs/example-heartbeat/index.ts` — `info` → `debug`
- Modify: `src/jobs/scheduler.ts` — use `logger.error({ jobId: def.id }, "unhandled job error", err)`
- Modify: `src/jobs/runner.ts` — use `logger.error({ jobId: def.id }, "job failed", err)`
- Modify: `src/jobs/resolve-cron.ts` — replace `{ err, … }` with `error: err instanceof Error ? err.message : String(err)`
- Modify: `src/server/app.ts` — `onError` already uses `logger.error(err, "unhandled request error")` from Task 3

**Spec of light retag (explicit):**

| Call site | Change |
| --- | --- |
| WarEra client success / status lines (`"warera request"`, gateway miss info) | `debug` |
| `example-heartbeat` | `debug` |
| Server listen, shutdown, job scheduled/complete, advisor phases | keep `info` |
| DB instrument | keep `debug` |

- [ ] **Step 1: Update WarEra client + test**

In `src/warera/client.ts`, change each `options.logger.info(... "warera request"...)` and the gateway-miss variant to `options.logger.debug(...)`.

In `src/warera/client.test.ts` `logs path, status, and durationMs`:

```ts
const logger = testLogger() as { debug: ReturnType<typeof vi.fn> };
// ...
expect(logger.debug).toHaveBeenCalledWith(
  expect.objectContaining({ path: "/v1/ping", status: 200, durationMs: expect.any(Number) }),
  expect.any(String),
);
```

Also add `debug: vi.fn()` to `testLogger()` if missing.

- [ ] **Step 2: Run client tests**

Run: `vp test src/warera/client.test.ts`

Expected: PASS

- [ ] **Step 3: Retag heartbeat + fix `{ err }` sites**

`src/jobs/example-heartbeat/index.ts`:

```ts
logger.debug({ jobId: "example-heartbeat" }, "heartbeat");
```

`src/jobs/scheduler.ts` (unhandled job error):

```ts
logger.error({ jobId: def.id }, "unhandled job error", err);
```

`src/jobs/runner.ts` (job failed):

```ts
logger.error({ jobId: def.id }, "job failed", err);
```

`src/jobs/resolve-cron.ts`:

```ts
logger.warn(
  {
    dbCron,
    defaultCron,
    error: err instanceof Error ? err.message : String(err),
  },
  "invalid job cron; using default",
);
```

- [ ] **Step 4: Run broader tests**

Run: `vp test src/warera/client.test.ts src/jobs src/server`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/client.ts src/warera/client.test.ts src/jobs/example-heartbeat/index.ts src/jobs/scheduler.ts src/jobs/runner.ts src/jobs/resolve-cron.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
refactor(logging): retag chatty info logs and drop pino err shape

Move routine request/heartbeat noise to debug; log Errors for tslog.

EOF
)"
```

---

### Task 5: Browser logger + web `api` logging

**Files:**
- Create: `src/logging/createBrowserLogger.ts`
- Create: `src/web/logger.ts`
- Modify: `src/web/api.ts`
- Modify: `src/web/api.test.ts`

**Interfaces:**
- Consumes: `Logger` from `src/logging/types.ts`
- Produces:
  - `export function createBrowserLogger(): Logger`
  - `export const webLogger: Logger` in `src/web/logger.ts`
  - `api()` logs success at `debug`, HTTP failures at `warn` (with status), unexpected throw at `error`

- [ ] **Step 1: Write failing api logging tests**

Extend `src/web/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ApiError, api } from "./api";
import { webLogger } from "./logger";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api logging", () => {
  it("logs successful requests at debug", async () => {
    const debug = vi.spyOn(webLogger, "debug");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true }, { status: 200 })),
    );

    await api<{ ok: boolean }>("/api/health");

    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/health",
        status: 200,
        durationMs: expect.any(Number),
      }),
      "api request",
    );
  });

  it("logs failed requests at warn", async () => {
    const warn = vi.spyOn(webLogger, "warn");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "not_found", message: "missing" } },
          { status: 404 },
        ),
      ),
    );

    await expect(api("/api/missing")).rejects.toBeInstanceOf(ApiError);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/missing",
        status: 404,
        durationMs: expect.any(Number),
      }),
      "api request",
    );
  });
});
```

Keep the existing ApiError test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/web/api.test.ts`

Expected: FAIL — logger / logging missing

- [ ] **Step 3: Implement browser logger + api wiring**

`src/logging/createBrowserLogger.ts`:

```ts
import { createLiteLogger } from "tslog/lite";
import type { Logger } from "./types";

type Lite = ReturnType<typeof createLiteLogger>;

function adaptLite(log: Lite): Logger {
  return {
    silly: (...args) => {
      log.silly(...args);
    },
    trace: (...args) => {
      log.trace(...args);
    },
    debug: (...args) => {
      log.debug(...args);
    },
    info: (...args) => {
      log.info(...args);
    },
    warn: (...args) => {
      log.warn(...args);
    },
    error: (...args) => {
      log.error(...args);
    },
    fatal: (...args) => {
      log.fatal(...args);
    },
    child: (opts) => adaptLite(log.getSubLogger({ name: opts?.name })),
  };
}

export function createBrowserLogger(): Logger {
  return adaptLite(
    createLiteLogger({
      name: "warera-web",
      minLevel: import.meta.env.DEV ? "DEBUG" : "WARN",
    }),
  );
}
```

`src/web/logger.ts`:

```ts
import { createBrowserLogger } from "../logging/createBrowserLogger";

export const webLogger = createBrowserLogger();
```

`src/web/api.ts` — wrap fetch:

```ts
import { webLogger } from "./logger";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const started = performance.now();
  try {
    const res = await fetch(path, { ...init, headers });
    const durationMs = Math.round(performance.now() - started);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      webLogger.warn(
        { path, status: res.status, durationMs },
        "api request",
      );
      throw new ApiError(
        res.status,
        body?.error?.message ?? res.statusText,
        typeof body?.error?.code === "string" ? body.error.code : undefined,
      );
    }
    webLogger.debug({ path, status: res.status, durationMs }, "api request");
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const durationMs = Math.round(performance.now() - started);
    webLogger.error({ path, durationMs }, "api request", err);
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/web/api.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logging/createBrowserLogger.ts src/web/logger.ts src/web/api.ts src/web/api.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add tslog/lite logger for api client requests

Structured path/status/duration logs in the browser console.

EOF
)"
```

---

### Task 6: AGENTS.md logging guidance + final verification

**Files:**
- Modify: `AGENTS.md`
- Verify: full suite

- [ ] **Step 1: Append Logging section to `AGENTS.md`**

After the Vite+ block, append a `## Logging` section that covers:

1. tslog v5 lives under `src/logging/`; server uses DI `createLogger`, web uses `src/web/logger.ts` (`tslog/lite`).
2. Prefer structured fields + short message, e.g. `logger.info({ jobId, pollId, itemCount }, "price poll complete")`.
3. Level table: `silly`/`trace` rare; `debug` for diagnostic HTTP/SQL/retries/heartbeats; `info` for lifecycle; `warn` recoverable; `error` failures; `fatal` process cannot continue. Link [SRE School — log levels](https://sreschool.com/blog/log-level/). Explicitly: do not default everything to `info`.
4. Secrets: respect `LOG_MASK_SECRETS` (default on in production); set `false` only for local secret debugging.
5. Optional `LOG_FILE=logs/app.log` for JSON file sink; leave unset in normal development.

- [ ] **Step 2: Run full check + tests**

Run:

```bash
vp check
vp test
```

Expected: both PASS. Fix any type errors from `Logger` interface narrowing in stubs (`silentLogger` in route tests may need `debug`/`silly`/`trace`/`fatal` no-ops).

- [ ] **Step 3: Fix test stubs if `vp test` fails on incomplete Logger mocks**

For stubs like `src/server/routes/prices.test.ts` / `scraps.test.ts`, expand:

```ts
const silentLogger = {
  silly: () => {},
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as Logger;
```

Same pattern for any `as never` mocks that break under stricter typing.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md src/server/routes/*.test.ts src/discord/notify.test.ts src/economy/advisor.test.ts src/jobs/**/*.test.ts
git commit -m "$(cat <<'EOF'
docs(agents): add tslog logging level and structure guidance

Document structured fields, level discipline, masking, and LOG_FILE.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Replace pino / pino-pretty with tslog v5 | 2 |
| Split server / browser factories | 2, 5 |
| `LOG_MASK_SECRETS` default + override | 1, 2 |
| `LOG_FILE` optional file transport | 1, 2 |
| Incoming `/api/*` access logs + levels | 3 |
| Web `api.ts` structured logs | 5 |
| Light retag chatty `info` → `debug` | 4 |
| Drop pino `{ err }` convention | 3, 4 |
| AGENTS.md logging section | 6 |
| `.env.example` docs | 1 |
| `vp check` / `vp test` | 6 |
