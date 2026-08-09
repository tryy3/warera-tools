# Worker user enrichment via tRPC batch

**Date:** 2026-08-10  
**Status:** Implemented  
**Related:** [Company worker simulation](./2026-08-04-company-worker-simulation-design.md), [Company economy advisor](./2026-07-31-company-economy-advisor-design.md), [WarEra API skill](../../../.agents/skills/warera-api/SKILL.md), [Data inventory](../../warera-api/inventory.md)

## Problem

`worker.getWorkers` returns employment fields only (`user`, `wage`, `fidelity`, company/employer ids, dates). It does **not** include username or skill levels. The companies UI therefore defaults missing `energyLevel` / `productionLevel` (and sometimes name) and shows an **Assumed** badge — profit math is wrong for real workers.

Observed live shape (gateway/api2):

- Present: `user`, `wage`, `fidelity`, …
- Missing: skills, username

Skills and username are available from allowlisted `user.getUserLite` (`skills.energy|production.level`, `username`).

Without batching, up to ~12 workers × N companies would multiply HTTP calls against our soft RPM limiter.

## Goals

1. Enrich each real worker with **username**, **energyLevel**, and **productionLevel** from `user.getUserLite`.
2. Keep **wage** and **fidelity** from `worker.getWorkers`.
3. Issue those lite fetches as **true tRPC HTTP batch** (one HTTP request per batch chunk) via the WarEra client.
4. Soft-fail **per worker**: successes enrich and count; failures show an **Error** badge and are **excluded from company/portfolio totals** until the user manually edits values (badge remains until a successful refresh clears the error).
5. Show **username** in the worker list when available.
6. Update `docs/warera-api/inventory.md` for this demand-driven enrich path.

## Non-goals

- Persisting user-lite snapshots in Turso (gateway ~5 min cache is enough for v1).
- Changing Assumed semantics for income tax / offer wage.
- Auto-retry loops beyond existing client GET retry behavior.
- Batching unrelated procedures in this change (batch API should be generic enough for later reuse).

## Design

### 1. WarEra client: `requestBatch`

Add to `createWareraClient` (or adjacent helper used by it):

```ts
type BatchItem = { procedure: string; input?: unknown };
type BatchResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: unknown };

requestBatch(items: BatchItem[], init?: WareraRequestInit): Promise<BatchResult[]>
```

**HTTP shape** (tRPC HTTP RPC batching):

- Path: `procA,procB,...` (comma-joined procedure names; for N× `user.getUserLite`, repeat the name N times).
- Query: `batch=1&input=<url-encoded JSON Record<index, input>>`  
  Example input object: `{ "0": { "userId": "…" }, "1": { "userId": "…" } }`.
- Method: GET (same preference as single queries).
- Response: array aligned by index; mixed success/error may be HTTP 207 — treat as success at transport level and parse each slot.

**Client behaviors:**

| Concern | Behavior |
| --- | --- |
| Rate limit | **One** `acquire` per HTTP batch request |
| Gateway → api2 fallback | Same “unknown method” fallback as single `request` when applicable |
| Empty batch | No-op → `[]` |
| URL length | If encoded URL exceeds a safe max (e.g. ~1800–2000 chars), split into multiple batch HTTP calls; preserve result order |
| Auth / baseUrl overrides | Honor existing `WareraRequestInit` (`authStyle`, `baseUrl`, …) |

Helpers in `src/warera/trpc.ts` (or next to client): build batch path/query; unwrap/parse batch envelope into `BatchResult[]`.

Extend `WareraRequester` (today `{ request }`) with optional or required `requestBatch` so advisor/users code stays injectable in tests. Production client from `createWareraClient` always provides both.

### 2. `fetchUserLiteBatch`

In `src/warera/users.ts`:

- `fetchUserLiteBatch(warera, userIds: string[]): Promise<Map<string, UserLiteSkills | null>>`
- Dedupe ids before calling `requestBatch`.
- Per index: parse with existing `parseUserLiteSkills` on success; `null` on failure (do not throw the whole batch).
- If `requestBatch` is unavailable in a test double, tests that need batch must stub it; production always has it.
- Log at `debug` with primitives + optional `failures_json` / counts (no nested object arrays for Sentry).

### 3. Advisor enrichment flow

In `buildAdvisor` / `enrichCompanyLive` pipeline:

1. Keep current per-company parallel enrich for `worker.getWorkers`, work offer, income tax (chunked as today).
2. After worker rows are collected for the portfolio, gather **unique** worker `userId`s.
3. Call `fetchUserLiteBatch` once (plus any URL-split chunks inside the helper).
4. Merge into each `AdvisorWorker`:

| Field | Source |
| --- | --- |
| `wagePerPp` | worker row |
| `fidelityPct` | worker row |
| `username` | user lite (else null) |
| `energyLevel` | `skillLevels.energy` (else null) |
| `productionLevel` | `skillLevels.production` (else null) |
| `enrichmentError` | `true` when lite missing/failed for that userId |

Company `workersStatus` stays `"ok"` if `getWorkers` succeeded, even if some lites failed. Soft-fail does not wipe the company workers section.

### 4. Sim / UI

**Model** (`AdvisorWorker` / `SimWorker`):

- Add `enrichmentError: boolean` (default false for simulated workers).
- Hydration: if `enrichmentError`, do **not** invent skill defaults for totals inclusion; still may store placeholder levels for display/edit, but mark excluded.

**Totals:**

- `deriveCompanyCard` / `companyDay` inputs: only include workers where `!enrichmentError || dirty` (manual edit brings them back into math).
- Active worker count used for display should distinguish “listed” vs “included in totals” if needed (e.g. header Active Workers = included count; error rows still visible in the list).

**Badges** (real workers):

| Badge | When |
| --- | --- |
| **Error** | `enrichmentError === true` (persists after manual edit until successful refresh clears it) |
| **Assumed** | `assumedFields.length > 0` and not solely representing the error case — prefer showing **Error** instead of **Assumed** when `enrichmentError` (avoid double-noise); Assumed remains for non-error workers with remaining nulls |
| **Simulated** / **Inactive** | unchanged |

**Name:** prefer `username` from lite; fallback to user id string as today.

**Edit:** Error rows remain editable. On edit → `dirty: true` → included in totals; **Error** badge stays until hydrate from a successful lite clears `enrichmentError`.

### 5. Inventory

Update User-tier row for workers / wages in `docs/warera-api/inventory.md`:

- On Companies Load/Refresh, after `worker.getWorkers`, batch `user.getUserLite` for unique worker ids (skills + username).
- Still demand-driven User tier; ephemeral (not a new Turso table).
- Note client `requestBatch` exists; inventory “Batching … Not implemented” line should reflect HTTP tRPC batch for this path (gateway’s own 400ms batch window remains separate).

## Failure matrix

| Failure | Result |
| --- | --- |
| `getWorkers` throws | Existing: company `workersStatus: "unavailable"`, no workers |
| Batch HTTP fails entirely | All targeted users → `enrichmentError`; wage/fidelity still shown if workers loaded |
| One slot in batch errors | That worker → `enrichmentError`; others enrich normally |
| Lite OK but skill keys missing | Levels null → Assumed defaults for non-error path (rare if lite is complete) |

## Testing

- Unit: batch path builder + response parser (success array, mixed error slots, URL split).
- Unit: `fetchUserLiteBatch` maps ok/null per id; dedupes.
- Advisor: merge username/skills; `enrichmentError` when lite fails; getWorkers still ok.
- Sim derive: error worker excluded from net until `dirty`; included after edit; badge flags.
- UI: smoke via existing companies tests if present; otherwise derive/reducer coverage is enough for v1.

## Implementation order

1. tRPC batch helpers + `requestBatch` + tests.  
2. `fetchUserLiteBatch` + tests.  
3. Advisor merge + `enrichmentError` on API types + tests.  
4. Sim hydrate/derive/UI badges + username display + tests.  
5. Inventory + remove or slim temporary worker-field debug logs if no longer needed after verify.

## Open questions

None for v1 — resolved in brainstorming:

- Batch strategy: true tRPC HTTP batch (A).  
- Failure: per-worker Error, exclude from totals; manual edit re-includes; badge stays until refresh success.
