# Sentry as tslog Transport (Server) — Design

**Date:** 2026-08-04  
**Status:** Approved  
**Depends on:** [2026-08-02-tslog-migration-design.md](./2026-08-02-tslog-migration-design.md)  
**Agent guidance:** root `AGENTS.md` Logging section (extend with optional Sentry note)

## Goal

Wire **Sentry** into the server tslog pipeline so one process gets both **error tracking (Issues)** and **structured logging (Sentry Logs)**, enabled in development and production whenever a DSN is configured. Browser Sentry is deferred.

## Decisions

| Topic | Choice |
| --- | --- |
| Scope | Server only (`@sentry/node`); no browser SDK in this pass |
| Enablement | On when `SENTRY_DSN` is set; unset = no Sentry (dev/prod alike) |
| Issues transport | `ERROR` / `FATAL` → `captureException` / `captureMessage` |
| Logs transport | Same min level as console (`LOG_LEVEL`); `enableLogs: true` + `Sentry.logger.*` |
| Module shape | Dedicated `src/logging/sentry.ts`; attach from `createServerLogger` (same pattern as `LOG_FILE`) |
| Tracing / performance | Out of scope |
| Source maps / sampling UI | Out of scope |

## Architecture

Single Node process (`src/server/index.ts`) creates one DI logger; in-process jobs inherit it via child loggers / injection.

```
loadConfig()
  → createServerLogger(config)
       → if sentryDsn: initSentry(config)
       → attach console (tslog default)
       → if logFile: fileTransport
       → if sentryDsn: attachSentryTransports (issues + logs)
  → … app / jobs use Logger …

shutdown:
  → await logger.flush?.()
  → await closeSentry()
```

Transports are inherited by sub-loggers. Transport isolation means a Sentry failure never breaks console/file logging.

## Components

| Piece | Role |
| --- | --- |
| `src/config/env.ts` | `sentryDsn: string \| undefined` from `SENTRY_DSN` |
| `.env.example` | Document `# SENTRY_DSN=` |
| `src/logging/sentry.ts` | `initSentry`, `attachSentryTransports`, `closeSentry` — no-ops without DSN |
| `src/logging/createServerLogger.ts` | Call init + attach when DSN present |
| `src/logging/mask.ts` | Add `SENTRY_DSN` / `dsn` to `MASK_KEYS` |
| `src/server/index.ts` | Flush logger + `closeSentry` on SIGINT/SIGTERM |
| `AGENTS.md` | Optional Sentry transport gated by `SENTRY_DSN` |
| Dependency | `@sentry/node` (install via `vp add`) |

### `initSentry(config)`

- No-op if `!config.sentryDsn`
- Otherwise `Sentry.init({ dsn, enableLogs: true, environment: config.nodeEnv })`
- If init throws: write to `console.error`, leave Sentry disabled (do not crash boot; do not attach transports)

### `attachSentryTransports(log, config)`

Follow the [tslog Sentry recipe](https://tslog.js.org/#sentry):

1. **Issues** — `name: "sentry"`, `minLevel: "ERROR"`, `format: "json"`; prefer `nativeError` on the record for `captureException`, else `captureMessage`; level `fatal` vs `error` from `_logMeta.logLevelName`
2. **Logs** — `name: "sentry-logs"`, `minLevel` = uppercased `config.logLevel`, `format: "json"`; map SILLY/TRACE→`trace`, DEBUG→`debug`, INFO→`info`, WARN→`warn`, ERROR→`error`, FATAL→`fatal`; call `Sentry.logger[method](message, attributes)` with fields from the JSON line (strip `_logMeta` / `message`)

Only call when DSN is set and init succeeded.

### `closeSentry()`

- No-op if never initialized
- Otherwise `await Sentry.close()` (bounded flush)

## Env

| Variable | Meaning |
| --- | --- |
| `SENTRY_DSN` | Optional. If set, enable Sentry Issues + Logs transports. If unset, no Sentry. |

Existing `LOG_LEVEL`, `LOG_MASK_SECRETS`, and `LOG_FILE` behavior unchanged. When masking is on, masked JSON reaches Sentry transports too. Dev still defaults masking **off**.

## Error handling

- Throwing transport `write` must not break the logger (tslog isolation)
- Init failure → console error + skip transports
- Missing DSN → silent no-op (tests, local without Sentry)

## Testing

- Parse config: `sentryDsn` undefined when unset; string when set
- Unit-test transport helpers with mocked `@sentry/node` (no network): ERROR with `Error` → `captureException`; INFO → `Sentry.logger.info` with attributes
- Existing `createServerLogger` tests leave DSN unset

## Out of scope

- Browser / `tslog/lite` + `@sentry/browser`
- Hono request tracing / performance spans
- Source-map upload, release health, custom sampling policies
- Requiring DSN in CI or production (opt-in only)

## Manual try-out

1. Create a Sentry project; copy DSN into `.env` as `SENTRY_DSN=…`
2. `vp run dev`
3. Trigger an `info` and an `error` (with `Error` instance) via normal server paths
4. Confirm a Log entry and an Issue appear in Sentry
