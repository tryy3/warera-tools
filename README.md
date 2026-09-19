# WarEra Toolkit

Personal tools for [warera.io](https://warera.io) — scheduled jobs, API helpers, and a local WebUI.

Design: [`docs/superpowers/specs/2026-07-31-warera-toolkit-foundation-design.md`](docs/superpowers/specs/2026-07-31-warera-toolkit-foundation-design.md)

## Prerequisites

- [Nix](https://nixos.org/) with flakes + [direnv](https://direnv.net/) (recommended), **or** Node 22+ and pnpm
- [Vite+](https://vite.plus) (`vp`) — install with `curl -fsSL https://vite.plus | bash` if missing
- PostgreSQL — set `DATABASE_URL` (production is typically Pigsty-managed Postgres on the operator host)
- Docker (or Podman) for integration tests — Vitest uses Testcontainers Postgres (see [Check / test](#check--test))

### Nix / devenv note

devenv needs import-from-derivation. If `nix develop` fails with an IFD error, enable it once:

```bash
# per-invocation
NIX_CONFIG='allow-import-from-derivation = true' nix develop --no-pure-eval --accept-flake-config

# or add to ~/.config/nix/nix.conf (or /etc/nix/nix.conf):
# allow-import-from-derivation = true
```

`.envrc` uses `use flake . --no-pure-eval`. Trust flake substituters with `--accept-flake-config` (or configure devenv.cachix.org in nix.conf).

## Setup

```bash
direnv allow   # or: nix develop --no-pure-eval
# Install vp if missing: curl -fsSL https://vite.plus | bash
vp install
cp .env.example .env
```

Edit `.env` — at minimum set `DATABASE_URL` (Postgres connection string). Full list of variables is in [`.env.example`](.env.example).

**Turso → Postgres cutover (operators):** step-by-step checklist in the [migration design](./docs/superpowers/specs/2026-09-18-turso-to-postgres-migration-design.md) (§ Cutover checklist). Download a Turso SQLite dump once, then copy locally: `pnpm run migrate:turso-to-postgres -- --sqlite ./turso-backup.db --truncate` (no live Turso reads). Archived SQLite migrations live under `drizzle-bak/`.

## Dev

```bash
vp run dev             # preferred: API :8787 + Vite WebUI :5173
# or: pnpm dev
```

- API listens on `http://127.0.0.1:8787`
- WebUI at `http://127.0.0.1:5173` (Vite proxies `/api` → `:8787`)

WebUI: **Calculator** (gear vs scrap), **Companies** (advisor Profit/PP + switch payback), **Growth**, **Market** (prices + history charts), **Countries**, and **Jobs**. Market prices are polled hourly into local history (`price-poll`) from `itemTrading.getPrices` + top orders; Calculator and Companies read that history. Select a player in the shell header to Load company data for Companies/Growth. Set `WARERA_API_KEY` for auth-required procedures.

API-only: `pnpm dev:server`. WebUI-only: `pnpm dev:web`.

## Check / test

```bash
vp check               # fmt + lint + types
vp test                # Vitest (includes Postgres integration tests via Testcontainers)
# or: pnpm check / pnpm test
```

`vp test` needs a container runtime with a Docker-compatible API. GitHub Actions CI uses the hosted Docker socket. Locally with **Podman**, point Testcontainers at the rootless socket and disable Ryuk:

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
export TESTCONTAINERS_RYUK_DISABLED=true
```

Optional: set `TEST_DATABASE_URL` to a fixed Postgres instead of starting a container (see `src/db/test/postgres.ts`).

## Production / Deploy

Single Node process serves the API, static WebUI (`dist/web`), and Croner jobs.

### Docker (recommended)

```bash
cp .env.example .env   # on the server; fill secrets (including DATABASE_URL)
docker compose -f docker-compose.example.yml --env-file .env up -d --build
```

- Listen: `HOST=0.0.0.0` / `PORT=8787` (compose sets these)
- Access on Tailscale: `http://<tailscale-hostname>:8787`
- Health: `GET /api/health` → `{ "ok": true }` (liveness only; DB errors appear in logs/jobs)
- Migrations run automatically on boot
- First boot may take longer while migrations run; the healthcheck start-period is 60s
- If you set `LOG_FILE`, mount a writable volume for that path (the container runs as non-root)
- Do not commit `.env`

Copy `docker-compose.example.yml` to a host-local compose file if you need machine-specific overrides.

### Without Docker

```bash
vp run build
NODE_ENV=production pnpm start
```

## WarEra API

Official public surface is live `api2.warera.io` (not in-game hosts such as `api5`):

- Live API: `https://api2.warera.io/trpc` (`WARERA_API_BASE_URL`)
- `/docs` and OpenAPI are an incomplete snapshot, not the allowlist
- Fuller catalog: https://warera.realmarijn.nl/api-explorer · OpenAPI vs custom: https://github.com/WarEraProjects/TRPC
- Auth: `X-API-Key` whenever `WARERA_API_KEY` is set (`Authorization: Bearer` is an explicit opt-out)
- In-process facade: local RPM + header-aware 429 pause, tRPC batch (max 50), in-flight dedup
- Response-shape notes: https://majimawrks.github.io/warera-api-docs/#/

Agent notes: [`.agents/skills/warera-api/SKILL.md`](.agents/skills/warera-api/SKILL.md) · catalog: [`.agents/skills/warera-api/procedures.md`](.agents/skills/warera-api/procedures.md).
