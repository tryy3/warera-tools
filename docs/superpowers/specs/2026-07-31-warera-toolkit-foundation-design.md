# WarEra Toolkit — Foundation Design

**Date:** 2026-07-31  
**Status:** Approved for implementation planning  
**Scope:** Project foundation only (no real game features yet)

## Goal

Build a personal Node.js toolkit for interacting with [warera.io](https://warera.io) — background jobs (trade monitoring later), calculators, and a small WebUI — starting with a solid shared foundation.

Primary audience for now: single user on a local NixOS machine. Later possible: Docker on a personal server, then maybe multi-user. Design should not block those paths, but must not implement them yet.

## Decisions

| Topic | Choice |
| --- | --- |
| Runtime shape | One Node process: HTTP API + static WebUI + in-process job scheduler |
| Package layout | Single package, modular folders (not a monorepo) |
| Language | TypeScript |
| HTTP | Hono |
| WebUI | React SPA via Vite, tooling via [Vite+](https://viteplus.dev/) (`vp check`, fmt, lint, test) |
| Package manager | Prefer pnpm if Vite+ sets it up cleanly; otherwise npm |
| Database | [Turso](https://turso.tech/) (libSQL) + Drizzle ORM |
| Jobs | Cron expressions with seconds support; persist last-run + run history |
| Logging | pino structured logs to console; file transport later |
| Notifications | Discord webhooks only (bot later if needed) |
| Auth | None for now; localhost default; structure for BetterAuth later |
| Game API | `https://api5.warera.io` — explore as needed; older docs at `https://api2.warera.io/docs/` are hints only |
| Nix | `flake.nix` + devenv; system packages via flake when not npm deps |

## Architecture

```
warera/
  flake.nix
  devenv / direnv config
  package.json
  .env.example
  src/
    server/       # process entry: config, Hono, static SPA, start scheduler
    web/          # React SPA — shell + feature folders ("tabs")
    jobs/         # scheduler + one module folder per job
    db/           # Drizzle client, schema, migrations helpers
    warera/       # HTTP client, rate limit, cache helpers
    discord/      # webhook notifier
    config/       # env loading / typed config
  drizzle/        # SQL migrations
  docs/superpowers/specs/
```

### Process lifecycle

`src/server/index.ts`:

1. Load config from environment
2. Initialize pino logger
3. Connect to Turso via Drizzle
4. Apply migrations
5. Register code-defined jobs (upsert into DB)
6. Start Hono (API + SPA assets)
7. Start scheduler loop
8. Graceful shutdown on SIGINT/SIGTERM (stop accepting new job runs, finish in-flight if short)

### Modularity

- Shared core: `warera`, `db`, `discord`, `config`, job runner
- Each job lives in its own folder under `src/jobs/<job-id>/` and owns domain pacing/state
- Each WebUI tool/tab lives under `src/web/features/<name>/`
- Jobs and pages should not reach into each other’s internals; they share APIs and DB helpers only

## Data model

### `jobs`

Runtime registry and state. Code defines which jobs exist; DB holds enablement, schedule overrides, last-run fields, and job-owned state.

| Column | Notes |
| --- | --- |
| `id` | Stable string PK, e.g. `example-heartbeat` |
| `name` | Human label |
| `description` | Short text |
| `enabled` | Boolean |
| `cron` | 6-field cron expression (seconds supported) |
| `last_started_at` | Nullable timestamp |
| `last_finished_at` | Nullable timestamp |
| `last_status` | `success` \| `error` \| `running` |
| `last_error` | Short text, nullable |
| `state` | JSON blob for job-owned cursors (e.g. next item index) |

### `job_runs`

Execution history for admin UI and debugging.

| Column | Notes |
| --- | --- |
| `id` | PK |
| `job_id` | FK → `jobs.id` |
| `started_at` | Timestamp |
| `finished_at` | Nullable until complete |
| `status` | `success` \| `error` \| `running` |
| `message` | Short result / error summary |
| `duration_ms` | Nullable until complete |

Prune or cap history (e.g. keep last N runs per job) so the table stays small.

### `cache`

Generic key/value cache for WarEra (and other) data.

| Column | Notes |
| --- | --- |
| `key` | PK string |
| `payload` | JSON |
| `fetched_at` | Timestamp |
| `ttl_seconds` | Integer |
| `tags` | Optional string/JSON for invalidation later |

## Job scheduler

- Library: cron package with **seconds** support (e.g. Croner)
- Scheduling model: wall-clock cron matching (6 fields including seconds). The library fires at matching times; we do **not** use “last_finished + interval” math for due checks
- Before starting: job must be `enabled` and not already `running`
- On process restart: scheduler resubscribes from “now”; it does not try to replay missed ticks. `last_*` fields remain the source of truth for “when did this actually run” in the UI and for job-owned logic
- Persist `last_started_at` / `last_finished_at` / status on every run
- Overlap policy: never start a second concurrent run of the same job
- Domain pacing (API budgets, round-robin over many items) lives **inside** the job, using `jobs.state` as needed — scheduler stays generic
- DB `cron` may override the job’s default expression from code; if unset/invalid at runtime, fall back to the code default and log a warning

### Foundation example job

`example-heartbeat`: cron every minute (or similar), writes a log line and a successful `job_runs` row. No WarEra API calls.

### Admin capabilities (WebUI + API)

- List jobs with last status / next-ish info
- Enable / disable
- Trigger “run now”
- View recent `job_runs`

## WarEra API client

Location: `src/warera/`

- Base URL default: `https://api5.warera.io` (overridable)
- API key from env
- Soft global rate limit well under observed 200 req/min (configurable, default e.g. 120/min)
- Structured pino context on requests (`path`, status, latency)
- Cache helpers: `getCached` / `setCached` / `getOrFetch`
- Caching convention for later features:
  - Live data (trades/offers): no cache or very short TTL
  - Stable data (items, equipment stats): longer TTL + explicit refresh
- Foundation does not implement real trade/calculator endpoints — only client infrastructure

Official docs for api5 are incomplete; treat `https://api2.warera.io/docs/` as a starting hint only and discover live usage as features are built.

## Discord

Location: `src/discord/`

- Webhook sender: `notify({ title, body, severity? })`
- Env: `DISCORD_WEBHOOK_URL`
- Optional admin “test notification” later; not required beyond a callable helper in foundation

## WebUI

- React + Vite SPA served by Hono in production; Vite+ for check/fmt/lint/test
- Shell with nav tabs
- Foundation pages: Dashboard placeholder, Jobs admin
- Browser talks only to Hono JSON API
- No auth UI; leave middleware/extension point for BetterAuth
- Visuals: functional admin, not a marketing landing page

## Logging

- pino from process start
- Structured fields (job id, request path, etc.)
- Destination for foundation: console only
- Keep logger construction centralized so a file transport can be added for “production” later without rewriting call sites

## Config / secrets

`.env` (not committed), documented in `.env.example`:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `WARERA_API_KEY`
- `DISCORD_WEBHOOK_URL`
- `PORT` (and related)
- Rate-limit soft cap if exposed

Bind HTTP to localhost by default.

## Nix / developer experience

- `flake.nix` + devenv provide Node and project tooling
- Prefer installing non-npm system packages through the flake
- Prefer pnpm when easy under Vite+; fallback npm
- Typical flow: enter devenv → `vp install` → dev script for API + Vite → `vp check`
- Initialize git from the start with a sensible `.gitignore`

## Errors

- Job failures update `jobs` + `job_runs`, log with context, do not crash the process
- Rate limiter should wait rather than stampede into 429s
- Retries only for safe/idempotent GETs, with conservative defaults
- Hono returns a consistent JSON error shape; unexpected errors logged

## Testing

- Vitest via Vite+ for pure units (rate limiter, cache TTL helpers, small scheduler helpers)
- No live WarEra integration tests in foundation

## Out of scope (foundation)

- Trade monitors, calculators, and other real game tools
- Discord bot
- BetterAuth / multi-user accounts
- Docker
- File log transport
- Relying on outdated api2 docs as source of truth

## Success criteria

Foundation is done when:

1. `devenv` + Vite+/pnpm (or npm) can install and run the app locally
2. Turso schema migrates; jobs table + heartbeat job run on cron and survive restart (last-run preserved)
3. WebUI Jobs tab shows status / history / enable-disable / run now
4. WarEra client + rate limit + cache helpers exist and are usable by future jobs
5. Discord webhook helper can send a message when configured
6. `vp check` passes on the scaffolded code
7. Git repository initialized with design docs and project files
