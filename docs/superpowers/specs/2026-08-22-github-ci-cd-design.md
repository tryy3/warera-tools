# GitHub CI/CD Design

**Date:** 2026-08-22  
**Status:** Approved

## Goals

1. Run quality gates on pull requests before merge.
2. Publish a Docker image to GitHub Container Registry (GHCR) on every push to `main`.
3. Require green tests to merge; treat format/lint/type checks as advisory.
4. Allow admins to bypass branch protection when needed.

## Decisions

| Topic | Choice |
| --- | --- |
| Workflow layout | Two workflows (`ci.yml`, `docker.yml`) |
| PR checks | `vp test` required; `vp check` advisory (non-blocking) |
| Docker on PRs | No — publish only after merge to `main` |
| Docker tags | `latest` + commit SHA on each `main` push |
| Registry | `ghcr.io/tryy3/warera-tools` |

## Workflow: CI (`ci.yml`)

**Triggers:** `pull_request`, `push` to `main`

**Runner:** `ubuntu-latest`

**Setup (shared by both jobs):**

- Checkout
- Node 22 with pnpm 11.17.0 via corepack (matches `Dockerfile` / `package.json`)
- `pnpm install --frozen-lockfile`
- `vp` from local `node_modules` (`vite-plus`)

**Jobs:**

| Job | Command | Merge gate |
| --- | --- | --- |
| `test` | `vp test` | Required |
| `check` | `vp check` | Advisory only |

Branch protection on `main` lists only the `test` job as a required status check. `check` still runs and surfaces in the PR checks UI; failures do not block merge.

Admins can merge with failing or pending checks via existing branch protection (`enforce_admins: true` still allows override at merge time for admins).

## Workflow: Docker (`docker.yml`)

**Triggers:** `push` to `main` only

**Permissions:** `contents: read`, `packages: write`

**Steps:**

1. Checkout
2. `docker/login-action` → `ghcr.io` with `GITHUB_TOKEN`
3. `docker/build-push-action` — build repo `Dockerfile`, push tags:
   - `ghcr.io/tryy3/warera-tools:latest`
   - `ghcr.io/tryy3/warera-tools:<git-sha>`

No build on pull requests (faster CI; Dockerfile breakage caught post-merge).

## Branch protection update

Add required status check context matching the CI workflow job name (`test`). Keep existing PR requirement and admin enforcement.

## Out of scope

- PR Docker build verification
- Version tags (`v*`)
- Deploy to production host (compose pull/restart is manual)
- Nix/devenv in CI (Node + pnpm matches production Docker build)

## Verification

1. Open a PR → both `test` and `check` jobs run; only `test` blocks merge.
2. Merge to `main` → Docker workflow pushes to GHCR.
3. `docker pull ghcr.io/tryy3/warera-tools:latest` succeeds.
