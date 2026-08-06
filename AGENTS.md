<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## IMPORTANT — Working on `master`

**Before starting any task on the `master` branch**, check for uncommitted changes (`git status`).

1. **If there are uncommitted changes, commit them first** before doing anything else on `master`.
2. **If the changes feel weird, unexpected, or unclear** (wrong files, secrets, half-finished work, unknown origin) — **ask the user for confirmation** before committing.
3. **Never discard, delete, or restore** uncommitted work (`git restore`, `git checkout --`, `git reset --hard`, `git clean`, etc.) **without explicit user confirmation**.

This rule overrides the usual “only commit when asked” preference while on `master`: protecting existing work comes first.

---

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Architecture

Single package, one Node process: Hono API + static SPA + in-process Croner jobs. Turso (libSQL) + Drizzle. No auth yet (Tailscale / localhost); plan BetterAuth when adding auth. Production: Docker (`Dockerfile` + `docker-compose.example.yml`) — see README Deploy.

| Area | Location |
| --- | --- |
| Server / API | `src/server/` |
| Web SPA | `src/web/` (features under `src/web/features/`) |
| Domain math | `src/calculator/`, `src/economy/`, `src/growth/`, `src/market/` |
| WarEra client | `src/warera/` — allowlist + gateway prefs: `.agents/skills/warera-api/` |
| Game formulas | `.agents/skills/warera-game-mechanics/` |
| Jobs | `src/jobs/<job-id>/` |
| DB | `src/db/`, migrations in `drizzle/` |

Browser talks only to the Hono API. Notifications: Discord **webhooks** only (`src/discord/`).

Deep feature designs live under `docs/superpowers/specs/`. Specs can drift from code — prefer this file + skills + source of truth in code when they conflict.

## Data tiers

Classify new persisted / fetched data before inventing a one-off cache. Full model: `docs/superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md`.

| Tier | Who refreshes | Examples |
| --- | --- | --- |
| **Global** | Croner jobs (+ rare manual poll) | Market prices / history, recommended regions by item; item-market sales history via `item-market-tx-backfill` + `item-market-tx-poll` (`transaction.getPaginatedTransactions`) |
| **Geo** | Jobs over watchlist; cold miss live-fills | Regions, countries; **MU** via `mu-stats-poll` (30m) |
| **User** | Shell Load/Refresh → server TTL | Selected player, `GET /api/user` (skills/job/companies/income), `company_packs` |

Rules:

1. Jobs own Global and Geo. Tool pages must not live-scrape WarEra for those when tables are warm.
2. User data is demand-driven (no per-user cron). Shell player Load/Refresh is the control — keep it always visible.
3. Prefer shared TanStack Query keys for data reused across tools when live freshness is not critical (e.g. prices). Avoid loading heavy Geo dumps into the client unless a tool needs a narrow slice.
4. Event-driven Geo (`enqueueGeoRefresh` from battles/laws/etc.) is planned; not implemented yet. Jobs remain the bulk WarEra callers.
5. **Equipment Market** reads `item_market_transactions` via `/api/equipment`.

### Storage style (case by case)

- **Dedicated tables + jobs** when the domain needs history, watchlists, or structured queries (prices, regions, company packs).
- **Generic `cache` KV** (`src/db/cache.ts`) is fine for simple TTL key/value until a domain outgrows it.
- Do not add a parallel ad-hoc cache for something that already fits an existing tier/table pattern.

## Web UI

- TanStack Router (file routes under `src/web/routes/`).
- TanStack Query for shared client cache (memory-only; pack TTL aligned with server ~10m).
- **Charts:** default to TanStack Charts (`@tanstack/react-charts`) unless a clear gap forces another library.
- shadcn/ui as plumbing; keep the existing dark war-command look.

## Logging

This project uses [tslog v5](https://tslog.js.org/) for structured logging.

### Factories

- **Server:** dependency-injected via `createLogger` in `src/logging/` (full tslog).
- **Browser:** `src/web/logger.ts` (tslog/lite).

### Structured messages

Prefer structured fields plus a short message:

```ts
logger.info({ jobId, pollId, itemCount }, "price poll complete");
```

Do not default everything to `info`. Pick the level that matches operational severity (see [SRE School — log levels](https://sreschool.com/blog/log-level/)).

| Level | When to use |
| --- | --- |
| `silly` / `trace` | Rare; very verbose tracing only |
| `debug` | Diagnostic detail: HTTP bodies, SQL, retries, heartbeats |
| `info` | Normal lifecycle events (startup, job complete, user-facing actions) |
| `warn` | Recoverable problems (retries succeeded, deprecated paths) |
| `error` | Failures that need attention |
| `fatal` | Process cannot continue |

### Secrets

Respect `LOG_MASK_SECRETS` (default **on** in production). Set `LOG_MASK_SECRETS=false` only for local secret debugging.

### File sink

Optional `LOG_FILE=logs/app.log` enables a JSON file transport. Leave unset in normal development.

### Correlation (HTTP + jobs)

Use snake_case correlation attributes on structured logs:

| Attribute | When |
| --- | --- |
| `request_id` | Inside an `/api/*` request (`withLogContext` / access middleware) |
| `job_id` | Inside a job run |
| `job_run_id` | Inside a job run (DB `job_runs.id`) |

Do not invent parallel camelCase ids (`requestId`, `jobId`) in new log fields.

**Sentry Logs filters (examples):**

- One job run: `job_run_id:<id>`
- One HTTP request: `request_id:<uuid>`
- Exclude cron/job noise: `!has:job_run_id`

Each request/job also opens a Sentry span (`http.server` / `job.run`) when `SENTRY_DSN` is set (`tracesSampleRate: 1`). Prefer filtering on `request_id` / `job_run_id` for “everything in this unit of work”; use the trace UI to see the waterfall.

### Sentry

Optional. Set `SENTRY_DSN` to forward server logs via tslog transports: **Issues** for `error`/`fatal`, and **Sentry Logs** at the same min level as `LOG_LEVEL`. Unset disables Sentry (default for local/CI). Browser Sentry is not wired yet. Optional `SENTRY_ENVIRONMENT` overrides the Sentry `environment` tag (defaults to `NODE_ENV`).

Restart the server after changing `.env` (`tsx watch` does not reload env). On successful attach you should see `sentry transports attached` in the console. Issues only appear for `error`/`fatal` — look under **Explore → Logs** for `info`/`debug` (filter `environment:development`). Set `SENTRY_DEBUG=true` to print SDK transport traffic.

## Commands

| Task | Command |
| --- | --- |
| Install | `vp install` |
| Dev (API + WebUI) | `vp run dev` |
| Check | `vp check` |
| Test | `vp test` |
| Build | `vp run build` |

Prefer file-scoped Vitest when iterating: `vp test path/to/file.test.ts`.
