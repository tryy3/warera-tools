# Production Deploy (Tailscale + Docker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hardened single-container production deploy (Docker + compose example), prod-safe env defaults, and MIT/README publish prep for Tailscale self-hosting.

**Architecture:** Keep the existing one-process model (Hono + static SPA + Croner). Multi-stage Docker image builds with pnpm/`vp`, runs `node dist/server/index.js` as non-root with migrate-on-boot. Env defaults bind `0.0.0.0` in production and allow `SENTRY_ENVIRONMENT` override. Docs cover Turso primary vs branch and Tailscale access.

**Tech Stack:** Node 22 Docker images, pnpm, Vite+ (`vp build` / `vp pack`), Docker Compose, existing `/api/health`, `@sentry/node`, Vitest via `vp test`

**Design:** [2026-08-06-production-deploy-design.md](../specs/2026-08-06-production-deploy-design.md)

## Global Constraints

- No auth, no public ingress/TLS, no GitHub Actions / GHCR in this pass
- Migrations stay on boot; image must include `drizzle/`
- Healthcheck uses existing `GET /api/health` only (no DB probe)
- Runtime must not require `vp` / `tsx` — only `node dist/server/index.js`
- Prefer `vp test` / `vp check`; commit after each task
- Do not commit real `.env` or secrets

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/config/env.ts` | Prod `HOST` default; `sentryEnvironment` from `SENTRY_ENVIRONMENT` |
| `src/config/env.test.ts` | HOST / Sentry environment parse tests |
| `src/logging/sentry.ts` | `Sentry.init({ environment: config.sentryEnvironment })` |
| `src/logging/sentry.test.ts` | Assert environment / override |
| `src/logging/createServerLogger.ts` | Log attach confirmation with `sentryEnvironment` |
| `src/logging/createServerLogger.test.ts` | `baseConfig` includes `sentryEnvironment` |
| `.dockerignore` | Lean build context |
| `Dockerfile` | Multi-stage build + non-root runtime |
| `docker-compose.example.yml` | Example prod-shaped service |
| `.env.example` | Production / Docker / Turso branch comments |
| `README.md` | Deploy section |
| `LICENSE` | MIT |
| `AGENTS.md` | Note Docker as production path |

---

### Task 1: Env defaults — HOST + SENTRY_ENVIRONMENT

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/config/env.test.ts`
- Modify: `src/logging/sentry.ts`
- Modify: `src/logging/sentry.test.ts`
- Modify: `src/logging/createServerLogger.ts`
- Modify: `src/logging/createServerLogger.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: existing `parseConfig` / `AppConfig` / `initSentry`
- Produces:
  - `AppConfig.sentryEnvironment: string`
  - `HOST` default `0.0.0.0` when `NODE_ENV=production` and `HOST` unset; else `127.0.0.1`
  - `initSentry(config: Pick<AppConfig, "sentryDsn" | "sentryEnvironment">)` (or include both `nodeEnv` and `sentryEnvironment` if other callers still pass `nodeEnv` — prefer switching to `sentryEnvironment` only for init)

- [ ] **Step 1: Write the failing tests**

Add to `src/config/env.test.ts`:

```ts
it("defaults HOST to loopback except production → 0.0.0.0", () => {
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "development",
    }).host,
  ).toBe("127.0.0.1");
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "production",
    }).host,
  ).toBe("0.0.0.0");
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
    }).host,
  ).toBe("127.0.0.1");
});

it("sentryEnvironment falls back to nodeEnv and honors SENTRY_ENVIRONMENT", () => {
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "production",
    }).sentryEnvironment,
  ).toBe("production");
  expect(
    parseConfig({
      TURSO_DATABASE_URL: "file:test.db",
      NODE_ENV: "production",
      SENTRY_ENVIRONMENT: "staging",
    }).sentryEnvironment,
  ).toBe("staging");
});
```

Update the existing `"defaults host/port and rate limit"` test — it must still expect `127.0.0.1` when `NODE_ENV` is unset (defaults to development).

In `src/logging/sentry.test.ts`, update `initSentry` calls to pass `sentryEnvironment` (same string previously used as `nodeEnv` for environment), and add:

```ts
it("initSentry uses sentryEnvironment for Sentry environment", () => {
  expect(
    initSentry({
      sentryDsn: "https://key@o0.ingest.sentry.io/1",
      sentryEnvironment: "staging",
    }),
  ).toBe(true);
  expect(init).toHaveBeenCalledWith(
    expect.objectContaining({
      environment: "staging",
    }),
  );
});
```

Update existing `initSentry` test that expected `environment: "development"` to pass `sentryEnvironment: "development"` instead of relying on `nodeEnv`.

In `src/logging/createServerLogger.test.ts`, add to `baseConfig`:

```ts
sentryEnvironment: "test",
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/config/env.test.ts src/logging/sentry.test.ts src/logging/createServerLogger.test.ts`

Expected: FAIL — missing `sentryEnvironment` / wrong HOST defaults / `initSentry` signature mismatch

- [ ] **Step 3: Implement env + Sentry wiring**

In `src/config/env.ts`, extend `AppConfig`:

```ts
sentryEnvironment: string;
```

In `parseConfig`:

```ts
const nodeEnv = (env.NODE_ENV ?? "development") as AppConfig["nodeEnv"];
const defaultHost = nodeEnv === "production" ? "0.0.0.0" : "127.0.0.1";
return {
  nodeEnv,
  host: env.HOST ?? defaultHost,
  // ...unchanged fields...
  sentryDsn: env.SENTRY_DSN || undefined,
  sentryEnvironment: env.SENTRY_ENVIRONMENT || nodeEnv,
  // ...
};
```

In `src/logging/sentry.ts`:

```ts
export function initSentry(
  config: Pick<AppConfig, "sentryDsn" | "sentryEnvironment">,
): boolean {
  if (!config.sentryDsn) return false;
  if (initialized) return true;
  try {
    Sentry.init({
      dsn: config.sentryDsn,
      enableLogs: true,
      tracesSampleRate: 1,
      environment: config.sentryEnvironment,
      debug: process.env.SENTRY_DEBUG === "true" || process.env.SENTRY_DEBUG === "1",
    });
    initialized = true;
    return true;
  } catch (err) {
    console.error("Sentry.init failed; continuing without Sentry", err);
    initialized = false;
    return false;
  }
}
```

In `src/logging/createServerLogger.ts`, change the attach confirmation log to:

```ts
log.info(
  { enableLogs: true, environment: config.sentryEnvironment },
  "sentry transports attached",
);
```

(`initSentry(config)` already receives full `AppConfig` once the field exists.)

Update every `initSentry({ … nodeEnv … })` call in `sentry.test.ts` to pass `sentryEnvironment` instead of (or in addition to, if you keep unused) `nodeEnv`. Prefer **only** `sentryEnvironment` on the Pick type so TypeScript forces call-site updates.

Append to `.env.example` (keep existing vars; add comments):

```env
# Production / Docker: set NODE_ENV=production (compose example does this).
# HOST defaults to 0.0.0.0 in production; override if needed.
# HOST=0.0.0.0

# Optional Sentry environment tag (defaults to NODE_ENV).
# SENTRY_ENVIRONMENT=staging

# Turso: use the primary DB URL in production; use a Turso branch URL for local/dev
# so jobs and schema experiments do not write to prod data.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/config/env.test.ts src/logging/sentry.test.ts src/logging/createServerLogger.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts \
  src/logging/sentry.ts src/logging/sentry.test.ts \
  src/logging/createServerLogger.ts src/logging/createServerLogger.test.ts \
  .env.example
git commit -m "$(cat <<'EOF'
feat(config): prod HOST default and Sentry environment override

Bind 0.0.0.0 when NODE_ENV=production and allow SENTRY_ENVIRONMENT for staging tags.
EOF
)"
```

---

### Task 2: Docker image + compose example

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `docker-compose.example.yml`

**Interfaces:**
- Consumes: `pnpm run build` → `dist/web` + `dist/server`; `migrateDb` reads `./drizzle` from cwd; `GET /api/health`
- Produces: runnable image; example compose with healthcheck and restart policy

- [ ] **Step 1: Add `.dockerignore`**

Create `.dockerignore`:

```dockerignore
.git
.github
.agents
.direnv
.devenv
.superpowers
.worktrees
.cursor
node_modules
dist
coverage
logs
*.log
*.db
.env
.env.*
!.env.example
docs
agent-transcripts
flake.nix
flake.lock
.envrc
*.md
!README.md
```

(If `!.env.example` / `!README.md` prove awkward with the broad ignores, prefer an explicit allow-list style: ignore secrets and heavy dirs only — `node_modules`, `dist`, `.git`, `.env`, `.env.*`, `coverage`, `logs`, `.direnv`, `.devenv`, `.worktrees`, `.superpowers`. Do **not** ignore `drizzle/`.)

- [ ] **Step 2: Add multi-stage `Dockerfile`**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-bookworm AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate \
  && groupadd --system --gid 1001 warera \
  && useradd --system --uid 1001 --gid warera --create-home warera
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
USER warera
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
```

Notes for the implementer:

- `pnpm-workspace.yaml` is required for the Vite+ catalog resolution.
- Runtime **must** copy `drizzle/` (migrate-on-boot uses `process.cwd()/drizzle`).
- If `pnpm install --prod` fails because catalog packages need build tooling, fix by copying `node_modules` from the build stage with `pnpm prune --prod` instead — keep the image free of `tsx`/`vite` if practical, but correctness > minimal size.
- Do not `COPY .env` into the image.
- Pin `pnpm@11.17.0` to match `package.json` `devEngines.packageManager`.

- [ ] **Step 3: Add `docker-compose.example.yml`**

Create `docker-compose.example.yml`:

```yaml
# Copy to docker-compose.yml (gitignored if you add host-specific overrides) or:
#   docker compose -f docker-compose.example.yml --env-file .env up -d --build
#
# Tailscale: open http://<tailscale-hostname>:8787
# Turso: point .env at the primary DB in production; use a branch URL for dry-runs.

services:
  warera:
    build: .
    ports:
      - "8787:8787"
    env_file:
      - .env
    environment:
      NODE_ENV: production
      HOST: "0.0.0.0"
      PORT: "8787"
    restart: unless-stopped
    # Image HEALTHCHECK probes /api/health; compose inherits it.
```

- [ ] **Step 4: Build the image (smoke)**

Run from repo root (requires Docker):

```bash
docker build -t warera:local .
```

Expected: build succeeds. If the build stage fails on `vp` / `vite-plus` native optional deps, install the linux-x64 variant explicitly or ensure `pnpm install` pulls the correct `@voidzero-dev/vite-plus-linux-x64-*` package for the container platform.

Optional runtime smoke (needs a Turso URL — prefer a **branch**, never point a disposable compose test at prod unless intentional):

```bash
docker compose -f docker-compose.example.yml --env-file .env up --build -d
curl -sS http://127.0.0.1:8787/api/health
# expect: {"ok":true}
docker compose -f docker-compose.example.yml down
```

- [ ] **Step 5: Commit**

```bash
git add .dockerignore Dockerfile docker-compose.example.yml
git commit -m "$(cat <<'EOF'
feat(deploy): add hardened Dockerfile and compose example

Multi-stage Node 22 image with non-root user, drizzle migrations, and /api/health check.
EOF
)"
```

---

### Task 3: Docs, LICENSE, AGENTS

**Files:**
- Create: `LICENSE`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.env.example` (only if Task 1 left gaps — ensure production block is complete)

**Interfaces:**
- Consumes: Docker/compose paths from Task 2; env behavior from Task 1
- Produces: public-repo-ready MIT + deploy instructions

- [ ] **Step 1: Add MIT `LICENSE`**

Create `LICENSE` with MIT text, copyright line:

```text
Copyright (c) 2026 tryy3
```

(Use the full standard MIT license body.)

- [ ] **Step 2: Expand README Production → Deploy**

Replace the short `## Production` section in `README.md` with:

```markdown
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
- Do not commit `.env`

Copy `docker-compose.example.yml` to a host-local compose file if you need machine-specific overrides.

### Without Docker

```bash
vp run build
NODE_ENV=production pnpm start
```

### Checklist

| Item | Notes |
| --- | --- |
| Turso | Prod → primary DB; Dev → [Turso branch](https://docs.turso.tech/features/branching) of that DB |
| Sentry | Set `SENTRY_DSN`; `NODE_ENV=production` tags `environment` (override with `SENTRY_ENVIRONMENT` if needed) |
| WarEra | `WARERA_API_KEY` is account-bound; a dedicated key is optional later |
| Discord | Optional `DISCORD_WEBHOOK_URL` (use a prod channel webhook if desired) |
| Auth | Not required while Tailscale is the only ingress |
```

Keep the existing WarEra API section below; do not delete Prerequisites / Dev / Check sections.

- [ ] **Step 3: Update AGENTS.md Architecture blurb**

Change the sentence that currently says production may use Docker later to reflect that Docker is supported, e.g.:

```markdown
No auth yet (Tailscale / localhost); plan BetterAuth when adding auth. Production: Docker (`Dockerfile` + `docker-compose.example.yml`) — see README Deploy.
```

Keep the rest of AGENTS.md unchanged unless a one-line Logging note about `SENTRY_ENVIRONMENT` is useful:

```markdown
Optional `SENTRY_ENVIRONMENT` overrides the Sentry `environment` tag (defaults to `NODE_ENV`).
```

- [ ] **Step 4: Sanity check**

Run: `vp check`

Expected: PASS (or only pre-existing unrelated issues — fix anything introduced by this task)

Confirm files exist: `LICENSE`, `Dockerfile`, `docker-compose.example.yml`, `.dockerignore`

- [ ] **Step 5: Commit**

```bash
git add LICENSE README.md AGENTS.md .env.example
git commit -m "$(cat <<'EOF'
docs: MIT license and Tailscale/Docker deploy guide

Document Turso primary vs branch, Sentry prod tagging, and compose-based self-hosting.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Hardened Dockerfile (multi-stage, non-root) | Task 2 |
| `.dockerignore` | Task 2 |
| `docker-compose.example.yml` + healthcheck/restart | Task 2 |
| Prod `HOST` default `0.0.0.0` | Task 1 |
| `SENTRY_ENVIRONMENT` override | Task 1 |
| `/api/health` healthcheck (existing) | Task 2 |
| Migrate-on-boot + `drizzle/` in image | Task 2 |
| `.env.example` production comments | Task 1 (+3) |
| README Deploy + Turso/Sentry/WarEra checklist | Task 3 |
| MIT `LICENSE` | Task 3 |
| AGENTS.md Docker note | Task 3 |
| No Actions / auth / GHCR | Honored (non-goals) |
| Manual docker smoke | Task 2 Step 4 |

## Execution handoff

After this plan is approved, implement task-by-task with frequent commits as written above.
)
