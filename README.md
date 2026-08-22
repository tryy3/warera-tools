# WarEra Toolkit

Personal tools for [warera.io](https://warera.io) — scheduled jobs, API helpers, and a local WebUI.

Design: [`docs/superpowers/specs/2026-07-31-warera-toolkit-foundation-design.md`](docs/superpowers/specs/2026-07-31-warera-toolkit-foundation-design.md)

## Prerequisites

- [Nix](https://nixos.org/) with flakes + [direnv](https://direnv.net/) (recommended), **or** Node 22+ and pnpm
- [Vite+](https://vite.plus) (`vp`) — install with `curl -fsSL https://vite.plus | bash` if missing
- A [Turso](https://turso.tech/) database URL, or a local file DB for smoke tests (`file:local.db`)

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

Edit `.env` — at minimum set `TURSO_DATABASE_URL` (e.g. `file:local.db` for local smoke). Full list of variables is in [`.env.example`](.env.example).

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
vp test                # Vitest unit tests
# or: pnpm check / pnpm test
```

## Production / Deploy

Single Node process serves the API, static WebUI (`dist/web`), and Croner jobs.

### Docker (recommended)

```bash
cp .env.example .env   # on the server; fill secrets
# Turso: primary DB URL for production; Turso branch URL for local/dev dry-runs
docker compose -f docker-compose.example.yml --env-file .env up -d --build
```

- Listen: `HOST=0.0.0.0` / `PORT=8787` (compose sets these)
- Access on Tailscale: `http://<tailscale-hostname>:8787`
- Health: `GET /api/health` → `{ "ok": true }` (liveness only; Turso errors appear in logs/jobs)
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

Allowed public surface is the official tRPC API (not undocumented in-game hosts):

- Docs: https://api2.warera.io/docs/ · OpenAPI: https://api2.warera.io/openapi.json
- Default: `https://api2.warera.io/trpc` (`WARERA_API_BASE_URL`)
- Auth: `Authorization: Bearer` by default; some procedures use `X-API-Key` (`WARERA_API_KEY`)
- In-process facade: local RPM + header-aware 429 pause, tRPC batch (max 50), in-flight dedup
- Community response docs: https://majimawrks.github.io/warera-api-docs/#/
- Broader live explorer (some auth-required procedures missing from official OpenAPI): https://warera.realmarijn.nl/api-explorer

Prefer procedures listed in the official docs; explorer-only reads (e.g. `company.getRecommendedRegionIdsByItemCode`) are used only where designed. Agent notes: [`.agents/skills/warera-api/SKILL.md`](.agents/skills/warera-api/SKILL.md).
