# Production Deploy (Tailscale + Docker) — Design

**Date:** 2026-08-06  
**Status:** Approved  
**Depends on:** root `AGENTS.md` (Architecture, Logging, Commands); existing `/api/health`  
**Out of scope for later:** BetterAuth, public ingress, GitHub Actions / GHCR, dedicated WarEra API key, Codeberg mirror

## Goal

Make the toolkit runnable as a **single hardened Docker container** on a personal server reachable via **Tailscale**, with clear env/ops docs for Turso (prod DB vs dev branch), Sentry production tagging, and a public GitHub-ready repo (MIT + README). No auth in this pass — Tailscale is the access boundary.

## Decisions

| Topic | Choice |
| --- | --- |
| Packaging | Approach 2: hardened single-service image + compose example |
| Process model | Unchanged: one Node process (Hono API + static SPA + Croner jobs) |
| Access | Tailscale only; no public reverse proxy / TLS termination in-repo |
| Auth | Deferred (BetterAuth later); no app auth for this deploy |
| CI / image registry | Deferred; no GitHub Actions in this pass |
| License | MIT (`LICENSE`) |
| Publishing | Prep in-repo (README + LICENSE); creating/pushing the GitHub remote is a manual follow-up |
| Migrations | Stay on boot (`migrateDb` in server entry) — no migrate sidecar |
| Health | Existing `GET /api/health` → `{ ok: true }` (no DB probe in this pass) |
| WarEra API key | Keep current account-bound key; document optional dedicated key later |

## Architecture

```
Host (Tailscale)                         Turso cloud
┌─────────────────────────────┐          ┌──────────────────┐
│ docker compose              │          │ primary DB (prod)│
│  env_file: .env             │─────────▶│ branch DB (dev)  │
│  warera container           │          └──────────────────┘
│   HOST=0.0.0.0:8787         │
│   NODE_ENV=production       │          Sentry (optional)
│   non-root user             │─────────▶ environment=production
│   healthcheck /api/health   │
│   restart: unless-stopped   │          WarEra gateway
│   migrate on boot           │─────────▶ WARERA_API_KEY
└─────────────────────────────┘
```

Build: multi-stage Dockerfile → runtime image with `dist/web`, `dist/server`, production dependencies.  
Run: `node dist/server/index.js` (same as `pnpm start`).

## Components

| Piece | Role |
| --- | --- |
| `Dockerfile` | Multi-stage: install + `vp run build` → slim Node 22 runtime; non-root user; `CMD` starts server |
| `.dockerignore` | Exclude `node_modules`, `dist`, `.git`, `.env*`, docs noise, worktrees, etc. |
| `docker-compose.example.yml` | Example service: env_file, ports, restart, `HOST`/`NODE_ENV`, healthcheck |
| `src/config/env.ts` | Prod default `HOST=0.0.0.0`; optional `SENTRY_ENVIRONMENT` |
| `src/logging/sentry.ts` | Use `sentryEnvironment` (or equivalent) for `Sentry.init({ environment })` |
| `.env.example` | Production / Docker / Turso branch comments |
| `README.md` | Expand Production → Deploy checklist |
| `LICENSE` | MIT |
| Tests | `env.test.ts` (+ sentry test if environment source changes) |

### Dockerfile (expectations)

- **Build stage:** Node 22, enable corepack/pnpm, install deps, run `vp run build` (produces `dist/web` + `dist/server`).
- **Runtime stage:** Copy package manifest + prod `node_modules` + `dist/`; set `NODE_ENV=production`; run as non-root; expose `8787`.
- Prefer copying lockfile and using reproducible install; avoid baking secrets into the image.
- Exact base image tags and whether `vp` is required only at build time are implementation details — runtime must not need Vite+ / `tsx`.

### Compose example (expectations)

- Service name e.g. `warera`
- `env_file: .env` (host-managed; never committed)
- Explicit `environment` overrides for `NODE_ENV=production` and `HOST=0.0.0.0` if useful
- `ports: ["8787:8787"]` (or documented alternative)
- `restart: unless-stopped`
- `healthcheck` using `wget`/`curl`/`node` against `http://127.0.0.1:8787/api/health`
- Comment that the real compose file is copied from the example and kept local (or gitignored) if it holds host-specific bits

### Healthcheck

Reuse `GET /api/health`. Do not add a DB ping in this pass; container “healthy” means the HTTP server accepted connections. Document that Turso failures surface in logs/jobs, not the liveness probe.

## Env

| Variable | Dev (typical) | Prod (typical) |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` |
| `HOST` | default `127.0.0.1` | default **`0.0.0.0`** when production; compose sets explicitly |
| `PORT` | `8787` | `8787` |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Turso **branch** | Turso **primary** (existing) DB |
| `SENTRY_DSN` | optional | optional but recommended |
| `SENTRY_ENVIRONMENT` | unset → `nodeEnv` | unset → `production`; override only for staging-like boxes |
| `LOG_MASK_SECRETS` | default off | default **on** |
| `WARERA_API_KEY` | shared account key OK | same for now |
| `DISCORD_WEBHOOK_URL` | optional / dev channel | optional / prod channel |

### Code changes (env)

1. `HOST`: if unset, use `0.0.0.0` when `nodeEnv === "production"`, else `127.0.0.1`.
2. Add optional `sentryEnvironment` from `SENTRY_ENVIRONMENT`, falling back to `nodeEnv`.
3. Pass that value into `Sentry.init({ environment })`.
4. Update `.env.example` and unit tests.

### Turso workflow (ops, not code)

- **Production server:** point `.env` at the existing primary database.
- **Local development:** create/use a Turso branch of that DB; point local `.env` at the branch URL/token so schema experiments and job writes do not hit prod.
- Schema remains shared: both environments run the same Drizzle migrations on boot. Branching is isolation of *data*, not a separate migration path.

### Sentry

No separate Sentry “project” requirement. Filtering uses `environment` (already set from `nodeEnv`; optionally overridable). Ensure prod process has `NODE_ENV=production` (and DSN set). `tracesSampleRate: 1` stays for now; docs may note dialing down later under load.

## Docs & publish prep

**README** — expand Production into a Deploy section covering:

1. Build image / `docker compose` from the example
2. Host `.env` secrets (never commit)
3. Tailscale access URL pattern (`http://<tailscale-host>:8787`)
4. Migrate-on-boot behavior
5. Turso primary vs branch checklist
6. Sentry production environment
7. Optional Discord webhook
8. WarEra key note (account-bound; dedicated key later)

**LICENSE** — MIT, copyright holder = repo owner name/year as commonly used for this project.

**AGENTS.md** — brief note that production deploy may use Docker (align with existing “Production later may use Docker” line once implemented).

**GitHub** — after this work lands: create public repo, push, no Actions required in this pass.

## Non-goals

- Application authentication / multi-user tenancy
- Public internet exposure, Cloudflare, TLS certs in-compose
- GitHub Actions, GHCR publish, automated deploys
- Codeberg mirror
- Healthcheck that verifies Turso connectivity
- Rotating or provisioning a new WarEra API key
- Changing job schedules or rate limits for “prod vs dev”

## Testing / verification

- Unit: `parseConfig` HOST defaults and `SENTRY_ENVIRONMENT` fallback
- Unit: Sentry init receives expected `environment`
- Manual (implementer or operator): `docker build` + compose up against a non-prod Turso branch; hit `/api/health` and WebUI; confirm Sentry event/log shows `environment: production` when configured
- `vp check` / relevant tests before considering the change set done

## Success criteria

- Fresh clone + filled `.env` + compose example can run production mode on a Tailscale host
- Dev can use a Turso branch without code forks
- Sentry environments distinguish prod via `NODE_ENV` / optional override
- Repo is MIT-licensed with deploy docs suitable for public GitHub
)
