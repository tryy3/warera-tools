# Worker User Enrichment via tRPC Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich company workers with username + energy/production skills via batched `user.getUserLite`, with per-worker Error badge and exclusion from totals until manually edited.

**Architecture:** Add generic `requestBatch` on the WarEra client (tRPC HTTP `batch=1`). After per-company `worker.getWorkers`, portfolio-dedupe worker user ids and batch-fetch lite profiles. Merge into advisor workers; sim derive excludes `enrichmentError && !dirty` workers from day math; UI shows username + Error badge.

**Tech Stack:** TypeScript, existing `createWareraClient` / tslog, Vitest via `vp test`, Hono advisor path, React companies sim.

**Spec:** [docs/superpowers/specs/2026-08-10-worker-user-enrichment-batch-design.md](../specs/2026-08-10-worker-user-enrichment-batch-design.md)

## Global Constraints

- Only allowlisted WarEra procedures (`user.getUserLite`, existing `worker.getWorkers`).
- Prefer gateway; reuse client gateway→api2 fallback patterns.
- One rate-limit acquire per batch HTTP request.
- Soft-fail per worker for lite failures; do not set `workersStatus: "unavailable"` for lite-only failures.
- Sentry-friendly logs: primitives or `*_json` strings for nested dumps.
- Update `docs/warera-api/inventory.md` in the same work.
- Run tests with `node_modules/.bin/vp test <path>`.

## File map

| File | Role |
| --- | --- |
| `src/warera/trpc.ts` | Batch path builder + batch response parser |
| `src/warera/trpc.test.ts` | Unit tests for batch helpers |
| `src/warera/client.ts` | `requestBatch` on client return value |
| `src/warera/client.test.ts` | Batch HTTP + rate-limit + URL split tests |
| `src/warera/prices.ts` | Extend `WareraRequester` with optional `requestBatch` |
| `src/warera/users.ts` | `fetchUserLiteBatch` |
| `src/warera/users.test.ts` | Batch fetch / dedupe / per-id null |
| `src/economy/advisor.ts` | Portfolio lite merge + `enrichmentError` |
| `src/economy/advisor.test.ts` | Enrichment merge / error cases |
| `src/web/features/companies/types.ts` | `enrichmentError` on worker type |
| `src/web/features/companies/sim/*` | Hydrate, derive exclusion, badges, username |
| `docs/warera-api/inventory.md` | Document batch enrich path |

---

### Task 1: tRPC batch helpers

**Files:**
- Modify: `src/warera/trpc.ts`
- Create or modify: `src/warera/trpc.test.ts` (create if missing)
- Modify: export from `src/warera/index.ts` if other helpers are exported there

**Interfaces:**
- Produces:
  - `wareraBatchPath(items: { procedure: string; input?: unknown }[]): string`
  - `parseTrpcBatchResponse(json: unknown): Array<{ ok: true; data: unknown } | { ok: false; error: unknown }>`
  - `splitBatchByMaxUrlLength(items, maxUrlLength, buildPath): T[][]` OR path builder returns chunks — pick one clear API in implementation

- [ ] **Step 1: Write failing tests** for:
  - Path: two `user.getUserLite` → `user.getUserLite,user.getUserLite?batch=1&input=...` with indexed inputs
  - Parse success array of `{ result: { data } }`
  - Parse mixed slot with `{ error: ... }` → `ok: false`
  - URL split when a single batch would exceed max length

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node_modules/.bin/vp test src/warera/trpc.test.ts
```

- [ ] **Step 3: Implement helpers** in `trpc.ts` (pure functions, no fetch)

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `feat(warera): add tRPC batch path and response helpers`

---

### Task 2: `requestBatch` on Warera client

**Files:**
- Modify: `src/warera/client.ts` — return `{ request, requestBatch }`
- Modify: `src/warera/prices.ts` — `WareraRequester.requestBatch?`
- Modify: `src/warera/client.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers
- Produces: `requestBatch(items, init?): Promise<BatchResult[]>`
- Empty items → `[]` without HTTP
- Treat HTTP 200 and 207 as parseable success bodies
- On total HTTP failure (non-ok after retries/fallback): throw (caller maps to all-null) OR return all `ok: false` — **prefer throw** so `fetchUserLiteBatch` can mark all ids null without ambiguous partials; document in code
- Split oversized batches; concatenate results in order
- One `acquireSerialized` per HTTP call

- [ ] **Step 1: Failing client tests** — batch URL shape, single acquire for 3 items, 207 mixed results, empty batch no fetch

- [ ] **Step 2: Implement `requestBatch`** reusing `requestOnce` / fallback / retry patterns from `request` where practical (extract shared execute if needed, keep diff focused)

- [ ] **Step 3: Tests PASS + commit** `feat(warera): add requestBatch to Warera client`

---

### Task 3: `fetchUserLiteBatch`

**Files:**
- Modify: `src/warera/users.ts`, `src/warera/users.test.ts`, `src/warera/index.ts`

**Interfaces:**
- Consumes: `warera.requestBatch`
- Produces: `fetchUserLiteBatch(warera, userIds: string[]): Promise<Map<string, UserLiteSkills | null>>`
- Dedupe ids; preserve map keys for all requested unique ids
- Missing `requestBatch` → throw clear Error (tests stub it)

- [ ] **Step 1: Failing tests** — dedupe, parse skills, null on slot error, all-null when batch throws

- [ ] **Step 2: Implement + PASS + commit** `feat(warera): fetchUserLiteBatch via requestBatch`

---

### Task 4: Advisor merge + enrichmentError

**Files:**
- Modify: `src/economy/advisor.ts` — after company worker enrichments, unique user ids → `fetchUserLiteBatch` → merge
- Modify: `AdvisorWorker` in advisor.ts (+ web `types.ts` in Task 5 if duplicated)
- Modify: `src/economy/advisor.test.ts` — stub `requestBatch` / `fetchUserLiteBatch` path via `request` mock if batch goes through client; easiest: mock `requestBatch` on warera double

**Merge rules:**
- `username` ← lite
- `energyLevel` ← `skillLevels.energy`
- `productionLevel` ← `skillLevels.production`
- `enrichmentError: true` when map value is `null` or missing
- wage/fidelity unchanged from worker row
- Keep temporary debug logs; include `enrichment_error_count` primitive

- [ ] **Step 1: Failing advisor tests** for successful merge and per-worker error

- [ ] **Step 2: Implement merge in `buildAdvisor` after `enrichments` applied**

- [ ] **Step 3: PASS + commit** `feat(economy): enrich workers with batched user.getUserLite`

---

### Task 5: Sim hydrate, derive exclusion, UI badges

**Files:**
- Modify: `src/web/features/companies/types.ts` — `enrichmentError?: boolean` or required boolean
- Modify: `src/web/features/companies/sim/types.ts` — `enrichmentError` on `SimWorker`
- Modify: `src/web/features/companies/sim/reducer.ts` — copy flag; on error still allow defaults for edit form but track error
- Modify: `src/web/features/companies/sim/derive.ts` — filter workers: include if `!enrichmentError || dirty`
- Modify: `src/web/features/companies/CompaniesPage.tsx` — Error badge; hide Assumed when Error; show username (`worker.name`)
- Modify: reducer/derive tests

**Rules:**
- Simulated workers: `enrichmentError: false`
- Error + not dirty → excluded from `companyDay` workers array
- Error + dirty → included; Error badge remains
- Successful refresh hydrate clears error when live says false

- [ ] **Step 1: Failing derive/reducer tests**

- [ ] **Step 2: Implement + PASS**

- [ ] **Step 3: Commit** `feat(companies): Error badge and exclude failed worker enrichment from totals`

---

### Task 6: Inventory + cleanup

**Files:**
- Modify: `docs/warera-api/inventory.md` — User workers row + client batching note; bump last reviewed date
- Modify: spec status to Approved/Implemented if desired
- Optionally slim debug logs that are redundant after verify (keep field-sources log until user confirms, or leave)

- [ ] **Step 1: Update inventory**

- [ ] **Step 2: Run focused tests**

```bash
node_modules/.bin/vp test src/warera/trpc.test.ts src/warera/client.test.ts src/warera/users.test.ts src/economy/advisor.test.ts src/web/features/companies/sim/
```

- [ ] **Step 3: Commit** `docs(warera-api): inventory worker getUserLite batch enrichment`

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| `requestBatch` tRPC HTTP batch | 1–2 |
| URL split / one acquire | 2 |
| `fetchUserLiteBatch` | 3 |
| Portfolio unique ids + merge | 4 |
| `enrichmentError` + soft-fail | 4–5 |
| Exclude from totals until dirty | 5 |
| Error badge persists after edit | 5 |
| Username display | 5 (name from username) |
| Inventory update | 6 |
| Assumed hidden when Error | 5 |

## Execution

Inline execution in this session (user already approved “go ahead” to plan + code). Use TDD per task; commit after each task.
