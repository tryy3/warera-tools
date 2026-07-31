# WarEra Toolkit

Personal tools for warera.io (jobs, calculators, WebUI).

See `docs/superpowers/specs/2026-07-31-warera-toolkit-foundation-design.md`.

## Dev

```bash
direnv allow   # or: nix develop --no-pure-eval
# Install vp if missing: curl -fsSL https://vite.plus | bash
vp install
cp .env.example .env   # set TURSO_DATABASE_URL (e.g. file:local.db for local smoke)
vp run dev             # API :8787 + Vite WebUI :5173 (proxies /api)
```

API-only: `pnpm dev:server`. WebUI-only: `pnpm dev:web`.

## Production

```bash
vp run build           # dist/web + dist/server
NODE_ENV=production pnpm start   # serves API + static UI from dist/web
```

Env vars: see `.env.example`.
