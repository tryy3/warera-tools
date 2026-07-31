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

API-only: `pnpm dev:server`. WebUI-only: `pnpm dev:web`.

## Check / test

```bash
vp check               # fmt + lint + types
vp test                # Vitest unit tests
# or: pnpm check / pnpm test
```

## Production

```bash
vp run build           # dist/web + dist/server
NODE_ENV=production pnpm start   # API + static UI from dist/web
```

## WarEra API note

The live client targets `api5.warera.io` (see `WARERA_API_BASE_URL`). That API is **undocumented**; the client currently sends `Authorization: Bearer <WARERA_API_KEY>`. Header name/scheme may need adjustment when probing the live API.
