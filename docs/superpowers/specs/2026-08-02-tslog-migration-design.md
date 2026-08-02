# tslog Migration & Logging Hardening — Design

**Date:** 2026-08-02  
**Status:** Implemented  
**Depends on:** existing server `Logger` injection patterns (`src/logging/logger.ts` consumers)  
**Agent guidance:** root `AGENTS.md` Logging section

## Goal

Replace **pino** / **pino-pretty** with **tslog v5**, keep call-site churn low, and add structured logging practices that are useful now while preparing production knobs (file sink, secret masking) without enabling heavy prod ops yet.

## Decisions

| Topic | Choice |
| --- | --- |
| Library | tslog v5 (ESM); remove `pino` and `pino-pretty` |
| Module shape | Split factories: full `tslog` on server, `tslog/lite` in the browser |
| Prod file logging | Config + plumbing only — attach `fileTransport` when `LOG_FILE` is set; unset by default |
| Secret masking | On by default in production; off in development/test; override via `LOG_MASK_SECRETS` |
| Incoming HTTP logs | Hono middleware for `/api/*` only; structured fields; success → `debug`, 4xx → `warn`, 5xx → `error` |
| Web logging | Scaffold browser logger + wire `src/web/api.ts` (path/status/durationMs) |
| Existing levels | Light retag: chatty operational success (e.g. WarEra 2xx, heartbeats) → `debug` |
| Console format | tslog built-in pretty in non-prod; `type: "json"` in production |
| Agent guidance | Add Logging section to root `AGENTS.md` (levels + structured context) |

## Architecture

```
src/logging/
  types.ts                 # narrow Logger interface for DI + tests
  mask.ts                  # shared keys/paths when masking enabled
  createServerLogger.ts    # tslog Logger + optional file transport
  createBrowserLogger.ts   # tslog/lite for web
  httpAccess.ts            # Hono access-log middleware

src/server/app.ts          # mount httpAccess middleware
src/web/main.tsx           # create browser logger once; export/pass into api layer
src/web/api.ts             # outbound API structured logs
src/logging/logger.ts      # re-export createServerLogger + Logger for existing imports
```

**Dependency funnel (unchanged):** factories produce `Logger` → injected into server, WarEra client, DB instrument, jobs, advisor, Discord; web uses browser factory locally.

### Env

| Variable | Meaning |
| --- | --- |
| `LOG_LEVEL` | Min level (existing; map to tslog `minLevel`, case-insensitive) |
| `LOG_MASK_SECRETS` | Optional `true`/`false` override. Default: `true` when `NODE_ENV=production`, else `false` |
| `LOG_FILE` | Optional absolute/relative path. If set, attach JSON file transport; if unset, no file sink |

Document all three in `.env.example`.

### Server logger

- `name: "warera"`
- Non-production: omit `type` / pretty (tslog default)
- Production: `type: "json"`
- When masking on: apply `mask.keys` for `authorization`, `apiKey`, `token`, `password`, `cookie`, `WARERA_API_KEY`, `TURSO_AUTH_TOKEN`, `DISCORD_WEBHOOK_URL` (case-insensitive)
- When `LOG_FILE` set: `fileTransport({ path, format: "json" })` in addition to console
- Prefer logging `Error` instances (via `tslog/serializers` `err` where useful) over pino’s `{ err }` convention; update existing `{ err }` call sites

### Browser logger

- `createLiteLogger` from `tslog/lite`, `name: "warera-web"`
- `minLevel`: `DEBUG` when `import.meta.env.DEV`, else `WARN` (tslog client guidance); no separate web env var in v1
- No file transport; do not log secrets from the client

### Incoming HTTP

Middleware logs after the request completes:

- Fields: `method`, `path`, `status`, `durationMs`, `requestId`
- Levels: 2xx/3xx → `debug`; 4xx → `warn`; 5xx → `error`
- Only log paths under `/api/*` (skip static assets and SPA fallbacks)
- Attach `requestId` via child bindings (and `runInContext` if AsyncLocalStorage is already practical in this Hono setup; otherwise child bindings alone are enough for v1)

### Outbound HTTP

- **WarEra client (server):** keep structured `{ path, status, durationMs }` (+ existing context); successful routine requests at `debug`
- **Web `api()`:** same shape; success → `debug`; failure → `warn`/`error`

### Light level retag

Move clearly chatty operational noise from `info` to `debug` (examples: successful WarEra requests, example heartbeat). Keep meaningful lifecycle at `info` (server listen, job scheduled/complete summaries, advisor phase summaries that are useful at default verbosity).

## AGENTS.md — Logging guidance

Add a concise section covering:

1. **Prefer structured fields + short message** — e.g. `logger.info({ jobId, pollId, itemCount }, "price poll complete")` not only `"running task XXX"`.
2. **Level discipline** (tslog names; aligned with [SRE School log-level guide](https://sreschool.com/blog/log-level/)):
   - `silly` / `trace` — very fine-grained; rare
   - `debug` — diagnostic detail (per-request access, successful outbound HTTP, SQL, retries)
   - `info` — significant operational lifecycle / audit-worthy normal events
   - `warn` — unexpected but recoverable / client errors worth attention
   - `error` — definite failures needing investigation
   - `fatal` — process cannot continue
3. **Do not default everything to `info`.**
4. **Never log secrets in plaintext in production;** respect `LOG_MASK_SECRETS`; when debugging secrets locally, set `LOG_MASK_SECRETS=false` deliberately.
5. **Use the shared `Logger` type** — don’t import tslog ad hoc at random call sites when injection already exists.

## Testing

- Factory: masking on/off; file transport attached only when `LOG_FILE` set
- Access middleware: status → level mapping; static skip if implemented
- Existing stub loggers keep working against the narrow `Logger` interface
- Adjust assertions that expect specific levels after light retag
- Manual smoke: server pretty logs in dev; browser console shows `api` debug when level allows

## Out of scope

- Enabling file logging in daily development by default
- External log shipping (Sentry, Better Stack, etc.)
- Broad UI / route-navigation logging
- Full rewrite of every existing log message string
- Custom pretty templates beyond tslog defaults
- pino-compatible wire format preset (not needed — no pino pipeline consumers)

## Success criteria

- [x] `pino` and `pino-pretty` removed from dependencies
- [x] Server and browser logger factories in place
- [x] Incoming HTTP access logs + web `api` logs work as specified
- [x] `LOG_MASK_SECRETS` / `LOG_FILE` documented and wired (file inert when unset)
- [x] Light retag applied; AGENTS.md logging section present
- [x] `vp check` and `vp test` pass
