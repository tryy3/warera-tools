# Sentry tslog Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach Sentry Issues + Logs as tslog transports on the server whenever `SENTRY_DSN` is set (dev and prod).

**Architecture:** Optional `sentryDsn` on `AppConfig`; `src/logging/sentry.ts` owns `initSentry` / `attachSentryTransports` / `closeSentry`; `createServerLogger` wires them like the existing file transport; shutdown flushes the logger then closes Sentry.

**Tech Stack:** `@sentry/node`, tslog v5 transports, Vitest via `vp test`, Vite+ (`vp add` / `vp check`)

**Design:** [2026-08-04-sentry-tslog-transport-design.md](../specs/2026-08-04-sentry-tslog-transport-design.md)

## Global Constraints

- Server only — no browser / `@sentry/browser`
- Enable only when `SENTRY_DSN` is set; unset = silent no-op
- Both transports: Issues (`ERROR`+) and Logs (same `minLevel` as `LOG_LEVEL`)
- `Sentry.init({ enableLogs: true, environment: nodeEnv })`
- Init failure → `console.error`, skip transports, do not crash boot
- Prefer `vp test` / `vp check`; commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/config/env.ts` | `sentryDsn` from `SENTRY_DSN` |
| `src/config/env.test.ts` | Parse tests for DSN |
| `.env.example` | Document `SENTRY_DSN` |
| `src/logging/mask.ts` | Add `SENTRY_DSN` / `dsn` to `MASK_KEYS` |
| `src/logging/sentry.ts` | Init, transports, close |
| `src/logging/sentry.test.ts` | Mocked `@sentry/node` unit tests |
| `src/logging/createServerLogger.ts` | Call init + attach when DSN set |
| `src/logging/createServerLogger.test.ts` | Include `sentryDsn` in `baseConfig` |
| `src/server/index.ts` | Flush logger + `closeSentry` on shutdown |
| `AGENTS.md` | Optional Sentry note under Logging |
| `package.json` | `@sentry/node` dependency |

---

### Task 1: Config + mask keys for Sentry DSN

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/config/env.test.ts`
- Modify: `src/logging/mask.ts`
- Modify: `src/logging/createServerLogger.test.ts` (`baseConfig` only)
- Modify: `.env.example`

**Interfaces:**
- Consumes: existing `parseConfig` / `AppConfig`
- Produces:
  - `AppConfig.sentryDsn: string | undefined`
  - `MASK_KEYS` includes `"SENTRY_DSN"` and `"dsn"`

- [ ] **Step 1: Write the failing test**

Add to `src/config/env.test.ts`:

```ts
it("parses optional SENTRY_DSN", () => {
  expect(parseConfig({ TURSO_DATABASE_URL: "file:test.db" }).sentryDsn).toBeUndefined();
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      SENTRY_DSN: "https://key@o0.ingest.sentry.io/1",
    }).sentryDsn,
  ).toBe("https://key@o0.ingest.sentry.io/1");
});
```

Add to `src/logging/createServerLogger.test.ts` inside an existing describe or a small mask assert:

```ts
it("MASK_KEYS includes Sentry DSN fields", () => {
  expect(MASK_KEYS).toContain("SENTRY_DSN");
  expect(MASK_KEYS).toContain("dsn");
});
```

Also extend `baseConfig` with `sentryDsn: undefined` so `AppConfig` still type-checks after the field is added (do this in Step 3 if TypeScript fails earlier).

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/config/env.test.ts src/logging/createServerLogger.test.ts`

Expected: FAIL — `sentryDsn` missing / `MASK_KEYS` missing entries

- [ ] **Step 3: Implement config + mask + example**

In `src/config/env.ts`, add to `AppConfig`:

```ts
sentryDsn: string | undefined;
```

In `parseConfig` return object:

```ts
sentryDsn: env.SENTRY_DSN || undefined,
```

In `src/logging/mask.ts`, append to `MASK_KEYS`:

```ts
"SENTRY_DSN",
"dsn",
```

In `src/logging/createServerLogger.test.ts` `baseConfig`, add:

```ts
sentryDsn: undefined,
```

In `.env.example`, after the `LOG_FILE` block:

```bash
# Optional Sentry (Issues + Logs via tslog transports). Unset = disabled.
# SENTRY_DSN=
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/config/env.test.ts src/logging/createServerLogger.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts src/logging/mask.ts \
  src/logging/createServerLogger.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat(config): add optional SENTRY_DSN and mask keys

Prepare env plumbing for server-side Sentry tslog transports.
EOF
)"
```

---

### Task 2: Install `@sentry/node` + `src/logging/sentry.ts`

**Files:**
- Create: `src/logging/sentry.ts`
- Create: `src/logging/sentry.test.ts`
- Modify: `package.json` / lockfile via `vp add`

**Interfaces:**
- Consumes: `AppConfig` (`sentryDsn`, `nodeEnv`, `logLevel`); tslog `Logger` with `attachTransport`
- Produces:
  - `initSentry(config: Pick<AppConfig, "sentryDsn" | "nodeEnv">): boolean` — `true` if initialized
  - `attachSentryTransports(log: { attachTransport: ... }, config: Pick<AppConfig, "sentryDsn" | "logLevel">): void`
  - `closeSentry(): Promise<void>`
  - Module-level `initialized` flag so close/no-op works

- [ ] **Step 1: Install dependency**

Run: `vp add @sentry/node`

Expected: package listed under `dependencies`

- [ ] **Step 2: Write the failing tests**

Create `src/logging/sentry.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Logger as TsLogger } from "tslog";

const captureException = vi.fn();
const captureMessage = vi.fn();
const init = vi.fn();
const close = vi.fn(async () => true);
const loggerMethods = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
};

vi.mock("@sentry/node", () => ({
  init: (...args: unknown[]) => init(...args),
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  close: (...args: unknown[]) => close(...args),
  logger: loggerMethods,
}));

// Import AFTER mock — use dynamic import in beforeEach if the runner hoists vi.mock
import { attachSentryTransports, closeSentry, initSentry } from "./sentry";

describe("sentry logging", () => {
  beforeEach(async () => {
    init.mockClear();
    captureException.mockClear();
    captureMessage.mockClear();
    close.mockClear();
    for (const fn of Object.values(loggerMethods)) fn.mockClear();
    // Reset module state between tests if sentry.ts caches `initialized`
    vi.resetModules();
  });

  it("initSentry no-ops without DSN", async () => {
    const { initSentry: initFn } = await import("./sentry");
    expect(initFn({ sentryDsn: undefined, nodeEnv: "development" })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("initSentry calls Sentry.init with enableLogs", async () => {
    const { initSentry: initFn } = await import("./sentry");
    expect(
      initFn({
        sentryDsn: "https://key@o0.ingest.sentry.io/1",
        nodeEnv: "development",
      }),
    ).toBe(true);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o0.ingest.sentry.io/1",
        enableLogs: true,
        environment: "development",
      }),
    );
  });

  it("Issues transport captures Error on error()", async () => {
    vi.resetModules();
    const Sentry = await import("@sentry/node");
    const { initSentry: initFn, attachSentryTransports: attach } = await import("./sentry");
    initFn({ sentryDsn: "https://key@o0.ingest.sentry.io/1", nodeEnv: "test" });
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    attach(log, { sentryDsn: "https://key@o0.ingest.sentry.io/1", logLevel: "info" });
    const err = new Error("payment failed");
    log.error(err);
    await log.flush();
    expect(Sentry.captureException).toHaveBeenCalled();
    const [passed] = (Sentry.captureException as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(passed).toBe(err);
  });

  it("Logs transport forwards info fields", async () => {
    vi.resetModules();
    const Sentry = await import("@sentry/node");
    const { initSentry: initFn, attachSentryTransports: attach } = await import("./sentry");
    initFn({ sentryDsn: "https://key@o0.ingest.sentry.io/1", nodeEnv: "test" });
    const log = new TsLogger({ type: "hidden", minLevel: "INFO" });
    attach(log, { sentryDsn: "https://key@o0.ingest.sentry.io/1", logLevel: "info" });
    log.info({ userId: 42 }, "user logged in");
    await log.flush();
    expect(Sentry.logger.info).toHaveBeenCalledWith(
      "user logged in",
      expect.objectContaining({ userId: 42 }),
    );
  });
});
```

If `vi.mock` + `vi.resetModules` fights the runner, keep a single import of `./sentry` and export a test-only `resetSentryStateForTests()` from `sentry.ts` that clears the `initialized` flag — prefer that if the dynamic-import version is flaky.

- [ ] **Step 3: Run tests to verify they fail**

Run: `vp test src/logging/sentry.test.ts`

Expected: FAIL — module missing / exports missing

- [ ] **Step 4: Implement `src/logging/sentry.ts`**

```ts
import * as Sentry from "@sentry/node";
import type { AppConfig } from "../config/env";

const TO_SENTRY_LOG = {
  SILLY: "trace",
  TRACE: "trace",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
} as const;

type SentryLogMethod = (typeof TO_SENTRY_LOG)[keyof typeof TO_SENTRY_LOG];

let initialized = false;

/** @internal test helper */
export function resetSentryStateForTests(): void {
  initialized = false;
}

export function initSentry(config: Pick<AppConfig, "sentryDsn" | "nodeEnv">): boolean {
  if (!config.sentryDsn) return false;
  if (initialized) return true;
  try {
    Sentry.init({
      dsn: config.sentryDsn,
      enableLogs: true,
      environment: config.nodeEnv,
    });
    initialized = true;
    return true;
  } catch (err) {
    console.error("Sentry.init failed; continuing without Sentry", err);
    initialized = false;
    return false;
  }
}

type AttachableLogger = {
  attachTransport: (transport: {
    name?: string;
    minLevel?: string;
    format?: "json";
    write: (record: unknown, line: string) => void;
  }) => unknown;
};

function findNativeError(record: unknown): Error | undefined {
  const candidates = [record, ...Object.values((record ?? {}) as object)];
  for (const value of candidates) {
    const native = (value as { nativeError?: unknown } | null)?.nativeError;
    if (native instanceof Error) return native;
  }
  return undefined;
}

export function attachSentryTransports(
  log: AttachableLogger,
  config: Pick<AppConfig, "sentryDsn" | "logLevel">,
): void {
  if (!config.sentryDsn || !initialized) return;

  const minLevel = config.logLevel.trim().toUpperCase();

  log.attachTransport({
    name: "sentry",
    minLevel: "ERROR",
    format: "json",
    write(record, line) {
      const { _logMeta, ...fields } = JSON.parse(line) as {
        _logMeta?: { logLevelName?: string };
        message?: unknown;
      } & Record<string, unknown>;
      const level = _logMeta?.logLevelName === "FATAL" ? "fatal" : "error";
      const nativeError = findNativeError(record);
      if (nativeError) {
        Sentry.captureException(nativeError, { level, extra: fields });
      } else {
        Sentry.captureMessage(String(fields.message ?? line), { level, extra: fields });
      }
    },
  });

  log.attachTransport({
    name: "sentry-logs",
    minLevel,
    format: "json",
    write(_record, line) {
      const parsed = JSON.parse(line) as {
        _logMeta?: { logLevelName?: string };
        message?: unknown;
      } & Record<string, unknown>;
      const { _logMeta, message, ...attributes } = parsed;
      const levelName = (_logMeta?.logLevelName ?? "INFO") as keyof typeof TO_SENTRY_LOG;
      const method = (TO_SENTRY_LOG[levelName] ?? "info") as SentryLogMethod;
      Sentry.logger[method](String(message ?? ""), attributes);
    },
  });
}

export async function closeSentry(): Promise<void> {
  if (!initialized) return;
  await Sentry.close();
  initialized = false;
}
```

Adjust `AttachableLogger` / `minLevel` types if tslog’s `attachTransport` typings require `number | TLogLevelName` — match whatever compiles against `tslog@5.1.0`.

Simplify `sentry.test.ts` to call `resetSentryStateForTests()` in `beforeEach` instead of `vi.resetModules` once the helper exists.

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp test src/logging/sentry.test.ts`

Expected: PASS

If `captureException` does not receive the same `Error` instance (tslog clones), assert `instanceof Error` and `message === "payment failed"` instead of reference equality.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/logging/sentry.ts src/logging/sentry.test.ts
git commit -m "$(cat <<'EOF'
feat(logging): add Sentry init and tslog transports

Issues for ERROR/FATAL and Sentry Logs for LOG_LEVEL, gated by DSN.
EOF
)"
```

---

### Task 3: Wire Sentry into `createServerLogger`

**Files:**
- Modify: `src/logging/createServerLogger.ts`

**Interfaces:**
- Consumes: `initSentry`, `attachSentryTransports` from `./sentry`; `config.sentryDsn`
- Produces: server loggers with Sentry transports when DSN set and init succeeds

- [ ] **Step 1: Write a focused integration assertion**

Add to `src/logging/createServerLogger.test.ts` (mock Sentry at top of file or in this describe):

```ts
it("does not throw when sentryDsn is unset", () => {
  expect(() => createServerLogger(baseConfig({ sentryDsn: undefined }))).not.toThrow();
});
```

Optional stronger test (only if mock is already set up from Task 2 patterns): with mocked `init`, create logger with a DSN and assert `init` was called — otherwise rely on `sentry.test.ts` for transport behavior.

- [ ] **Step 2: Run test (may pass already for no-DSN)**

Run: `vp test src/logging/createServerLogger.test.ts`

- [ ] **Step 3: Wire factory**

In `src/logging/createServerLogger.ts`, import and call after constructing `TsLogger`, before `return adapt(log)`:

```ts
import { attachSentryTransports, initSentry } from "./sentry";

// inside createServerLogger, after `new TsLogger(...)` and file transport:
if (config.sentryDsn) {
  if (initSentry(config)) {
    attachSentryTransports(log, config);
  }
}
```

Keep the existing `logFile` block unchanged.

- [ ] **Step 4: Run tests**

Run: `vp test src/logging/createServerLogger.test.ts src/logging/sentry.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logging/createServerLogger.ts src/logging/createServerLogger.test.ts
git commit -m "$(cat <<'EOF'
feat(logging): attach Sentry transports from createServerLogger

Enable Issues + Logs when SENTRY_DSN is configured.
EOF
)"
```

---

### Task 4: Shutdown flush + AGENTS.md

**Files:**
- Modify: `src/server/index.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `logger.flush`, `closeSentry`
- Produces: clean process exit that drains Sentry

- [ ] **Step 1: Update shutdown in `src/server/index.ts`**

Add import:

```ts
import { closeSentry } from "../logging/sentry";
```

Replace the sync `shutdown` body so flush/close happen before exit (keep scheduler stop + `server.close`):

```ts
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  scheduler.stop();
  void (async () => {
    try {
      await logger.flush?.();
      await closeSentry();
    } catch (err) {
      console.error("shutdown flush failed", err);
    }
    server.close(() => {
      client.close();
      process.exit(0);
    });
  })();
  setTimeout(() => {
    client.close();
    process.exit(0);
  }, 5_000).unref();
};
```

- [ ] **Step 2: Document in `AGENTS.md`**

Under Logging, after the File sink subsection, add:

```markdown
### Sentry

Optional. Set `SENTRY_DSN` to forward server logs via tslog transports: **Issues** for `error`/`fatal`, and **Sentry Logs** at the same min level as `LOG_LEVEL`. Unset disables Sentry (default for local/CI). Browser Sentry is not wired yet.
```

- [ ] **Step 3: Verify**

Run: `vp check`

Run: `vp test src/logging/sentry.test.ts src/logging/createServerLogger.test.ts src/config/env.test.ts`

Expected: check + tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts AGENTS.md
git commit -m "$(cat <<'EOF'
feat(server): flush Sentry on shutdown and document SENTRY_DSN

Drain tslog transports and Sentry.close before exit.
EOF
)"
```

---

### Task 5: Manual smoke (no commit required)

- [ ] **Step 1:** Create/use a Sentry project; put DSN in `.env` as `SENTRY_DSN=…` (do not commit `.env`)

- [ ] **Step 2:** Run `vp run dev`

- [ ] **Step 3:** Hit a path that logs `info`, and temporarily trigger `logger.error(new Error("sentry smoke"))` (or use an existing 5xx path)

- [ ] **Step 4:** In Sentry UI, confirm a **Log** and an **Issue** appear under the `development` environment

- [ ] **Step 5:** Remove the temporary smoke log if you added one; leave `SENTRY_DSN` in local `.env` only

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `sentryDsn` / `SENTRY_DSN` | 1 |
| `.env.example` | 1 |
| `MASK_KEYS` for DSN | 1 |
| `@sentry/node` + `enableLogs` | 2 |
| Issues + Logs transports | 2 |
| Init failure soft-fail | 2 (`initSentry` try/catch) |
| Wire from `createServerLogger` | 3 |
| Shutdown flush + `closeSentry` | 4 |
| `AGENTS.md` note | 4 |
| Manual try-out | 5 |
| No browser / no tracing | Global constraints (not implemented) |
