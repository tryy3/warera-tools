# Followed Entities + Work Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent watch-reason lists for players and MUs, an hourly job that upserts daily company/worker work stats, and operator Follow pages to add/remove ids (search only fills the id).

**Architecture:** Parallel `player_watch_reasons` / `mu_watch_reasons` tables drive collection (`DISTINCT` subject id). `syncFollowedPlayers` refreshes `players` via `user.getUserById` and reconciles MU `follow_player` rows. `work-stats-poll` derives owned companies + rosters, batches work-stat POSTs to api2, upserts by `daily_date`. `mu-stats-poll` polls reason ids instead of `mus` row presence. Follow UI writes `manual` reasons only.

**Tech Stack:** TypeScript, Drizzle/Turso, Croner, Hono, TanStack Router, Vitest via `vp test`, Vite+ (`vp check`, `vp run db:generate`).

**Design:** [2026-08-20-followed-entities-work-stats-design.md](../specs/2026-08-20-followed-entities-work-stats-design.md)

## Global Constraints

- Jobs and post-add fetches never call `search.*`; search is add-form only
- `reason` is text (not a DB enum); v1 live: player `manual`, MU `manual` + `follow_player`
- `source_id` is `''` for manual; followed player id for `follow_player`
- Work history is upsert-by-day, not append-only polls; `days: 14`
- Work procedures: force api2 + POST JSON + `authStyle: "api-key"` (OpenAPI override)
- No company-reasons table; no work-stat charts or public read APIs for the new daily tables
- No FK from reason rows to `players`/`mus` (reason may exist before the entity row)
- Prefer `vp test path/to/file.test.ts` while iterating; `vp check` before considering a task done
- Commit after each task
- Update `docs/warera-api/inventory.md` in this work; do not update `vision.md`

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | `players`, `player_watch_reasons`, `mu_watch_reasons`, `company_work_stats`, `worker_work_stats` |
| `drizzle/0009_*.sql` (+ meta) | Tables + backfill `manual` MU reasons from existing `mus` / seed |
| `src/db/watch-reasons.ts` | Reason CRUD + distinct ids + follow_player reconcile |
| `src/db/players.ts` | Upsert current player identity |
| `src/db/work-stats.ts` | Upsert company/worker daily rows |
| `src/warera/users.ts` | Parse `muId` + `username`; `fetchUserByIdBatch` |
| `src/warera/search.ts` | Parse MU hits; `searchMus` |
| `src/warera/work-stats.ts` | Parse + batch-fetch work procedures |
| `src/warera/client.ts` | POST tRPC batch (`method: "POST"`) |
| `src/jobs/sync-followed-players.ts` | Shared sync used by jobs + Follow routes |
| `src/jobs/mu-stats-poll/run.ts` | Poll distinct MU reason ids; drop `ensureSeedMu` |
| `src/jobs/work-stats-poll/` | Hourly ingest job |
| `src/server/routes/economy.ts` | `type=user\|mu` on search |
| `src/server/routes/follow.ts` | Follow CRUD |
| `src/web/features/follow/` | Follow page + id/search picker |
| `src/web/routes/follow.tsx` | Route (let TanStack generate `routeTree.gen.ts`) |
| `.agents/skills/warera-api/SKILL.md` | Document `work.getStats*` override |
| `AGENTS.md` + `docs/warera-api/inventory.md` | Followed-user watchlist + work job |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0009_*.sql` + `drizzle/meta/*` via generate, then hand-edit SQL for data backfill

**Interfaces:**
- Consumes: existing drizzle sqlite patterns (`primaryKey`, `index`, `integer`, `real`, `sqliteTable`, `text`)
- Produces: tables `players`, `player_watch_reasons`, `mu_watch_reasons`, `company_work_stats`, `worker_work_stats`

- [ ] **Step 1: Append tables to `src/db/schema.ts` (after `muMemberStatSnapshots`)**

```ts
export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  username: text("username"),
  muId: text("mu_id"),
  workplaceCompanyId: text("workplace_company_id"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
});

export const playerWatchReasons = sqliteTable(
  "player_watch_reasons",
  {
    playerId: text("player_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.reason, t.sourceId] })],
);

export const muWatchReasons = sqliteTable(
  "mu_watch_reasons",
  {
    muId: text("mu_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.muId, t.reason, t.sourceId] })],
);

export const companyWorkStats = sqliteTable(
  "company_work_stats",
  {
    companyId: text("company_id").notNull(),
    dailyDate: text("daily_date").notNull(),
    automatedEngine: real("automated_engine"),
    employeeProd: real("employee_prod"),
    selfWork: real("self_work"),
    total: real("total"),
    wage: real("wage"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.dailyDate] })],
);

export const workerWorkStats = sqliteTable(
  "worker_work_stats",
  {
    companyId: text("company_id").notNull(),
    workerId: text("worker_id").notNull(),
    dailyDate: text("daily_date").notNull(),
    employeeProd: real("employee_prod"),
    total: real("total"),
    wage: real("wage"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.workerId, t.dailyDate] })],
);
```

Do **not** add FKs from reason tables to `players` / `mus`.

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate`

Expected: new `drizzle/0009_*.sql` creating the five tables.

- [ ] **Step 3: Hand-edit the generated SQL** to append backfill (timestamps are epoch ms). Keep drizzle-kit’s table DDL; add:

```sql
INSERT INTO mu_watch_reasons (mu_id, reason, source_id, last_touched_at, created_at)
SELECT id, 'manual', '', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM mus;

INSERT INTO mu_watch_reasons (mu_id, reason, source_id, last_touched_at, created_at)
SELECT '69e5dc36f7b095e977052f7b', 'manual', '', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM mu_watch_reasons LIMIT 1);
```

If drizzle-kit also writes `drizzle/meta/_journal.json`, leave that as generated.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(db): add follow reason and daily work-stat tables

Watchlists move to independent reason rows; work history upserts by calendar day.
EOF
)"
```

---

### Task 2: Watch-reason and player DB helpers

**Files:**
- Create: `src/db/watch-reasons.ts`
- Create: `src/db/watch-reasons.test.ts`
- Create: `src/db/players.ts`
- Create: `src/db/players.test.ts`

**Interfaces:**
- Consumes: schema tables from Task 1
- Produces:

```ts
export const WATCH_REASON_MANUAL = "manual";
export const WATCH_REASON_FOLLOW_PLAYER = "follow_player";
export const MANUAL_SOURCE_ID = "";

export async function insertPlayerWatchReason(db: Db, row: {
  playerId: string; reason: string; sourceId: string; at: Date;
}): Promise<void> // onConflictDoNothing

export async function deletePlayerWatchReason(db: Db, row: {
  playerId: string; reason: string; sourceId: string;
}): Promise<void>

export async function listDistinctFollowedPlayerIds(db: Db): Promise<string[]>

export async function insertMuWatchReason(db: Db, row: {
  muId: string; reason: string; sourceId: string; at: Date;
}): Promise<void>

export async function deleteMuWatchReason(db: Db, row: {
  muId: string; reason: string; sourceId: string;
}): Promise<void>

export async function listDistinctWatchedMuIds(db: Db): Promise<string[]>

export async function listMuWatchReasons(db: Db, muId: string): Promise<{
  reason: string; sourceId: string;
}[]>

export async function reconcileFollowPlayerMu(db: Db, input: {
  playerId: string; muId: string | null; at: Date;
}): Promise<void>
// delete all follow_player rows for this source_id, then insert (muId, follow_player, playerId) if muId

export async function deleteFollowPlayerReasonsForSource(db: Db, playerId: string): Promise<void>

export async function upsertPlayerCurrent(db: Db, row: {
  id: string;
  username: string | null;
  muId: string | null;
  workplaceCompanyId: string | null;
  payload: Record<string, unknown> | null;
  fetchedAt: Date;
}): Promise<void>
```

- [ ] **Step 1: Write failing tests** in `src/db/watch-reasons.test.ts`

Use an in-memory/file libsql client (same pattern as `src/db/mus.test.ts`). Create only `player_watch_reasons` and `mu_watch_reasons`.

Cover:

1. Insert two `manual` player reasons → `listDistinctFollowedPlayerIds` returns both, sorted stably (e.g. by id).
2. Duplicate insert is idempotent (still one row).
3. Two `follow_player` rows for the same MU / different `sourceId` → `listDistinctWatchedMuIds` returns one id.
4. `reconcileFollowPlayerMu` player A moves MU-1 → MU-2: MU-1 loses only that source row; a `manual` row on MU-1 remains; MU-2 gains `follow_player`.
5. `reconcileFollowPlayerMu` with `muId: null` deletes that source’s follow rows only.
6. `deletePlayerWatchReason` does not touch MU reasons.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/db/watch-reasons.test.ts`

Expected: FAIL (module or functions missing).

- [ ] **Step 3: Implement `src/db/watch-reasons.ts`**

Use drizzle `insert().onConflictDoNothing()`, `delete().where(and(eq(...)))`, `selectDistinct`. For reconcile: delete `mu_watch_reasons` where `reason = follow_player AND source_id = playerId`, then insert if `muId` is non-null.

- [ ] **Step 4: Write failing `src/db/players.test.ts`** — upsert twice updates `username` / `muId` / `workplaceCompanyId` / `fetchedAt`.

- [ ] **Step 5: Implement `upsertPlayerCurrent`** with `onConflictDoUpdate` on `players.id`.

- [ ] **Step 6: Run tests**

Run: `vp test src/db/watch-reasons.test.ts src/db/players.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/watch-reasons.ts src/db/watch-reasons.test.ts src/db/players.ts src/db/players.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add independent player and MU watch-reason helpers

Reasons add and delete without sharing a row, so follow vs manual can diverge.
EOF
)"
```

---

### Task 3: Extend `user.getUserById` parse + batch

**Files:**
- Modify: `src/warera/users.ts`
- Modify: `src/warera/users.test.ts`
- Modify: `src/warera/index.ts` (export new type/name if renamed)
- Modify: `src/skills/job-wage.ts` only if the type change requires it (`companyId` stays)

**Interfaces:**
- Consumes: existing `fetchUserLiteBatch` / `requestBatch` pattern
- Produces:

```ts
export type UserByIdRef = {
  userId: string;
  username: string | null;
  companyId: string | null;
  muId: string | null;
};

export function parseUserById(raw: unknown): UserByIdRef
export async function fetchUserById(warera: WareraRequester, userId: string): Promise<UserByIdRef>
export async function fetchUserByIdBatch(
  warera: WareraRequester,
  userIds: string[],
): Promise<Map<string, UserByIdRef | null>>
```

Keep `parseUserByIdCompany` as a thin wrapper `{ companyId: parseUserById(raw).companyId }` **or** replace it and update tests — do not leave two parsers that disagree. Prefer one `parseUserById`.

MU parse: string fields `mu`, `muId`, `militaryUnit` or nested `{ _id, id, muId }`. Username: `username` / `name`. User id: `_id` / `id` / `userId`.

- [ ] **Step 1: Extend tests in `src/warera/users.test.ts`**

```ts
it("reads nested mu and username", () => {
  expect(
    parseUserById({
      _id: "u1",
      username: "Alice",
      company: { _id: "co-2" },
      mu: { _id: "mu-9" },
    }),
  ).toEqual({
    userId: "u1",
    username: "Alice",
    companyId: "co-2",
    muId: "mu-9",
  });
});

it("returns null mu and company when missing", () => {
  expect(parseUserById({ _id: "u1" })).toEqual({
    userId: "u1",
    username: null,
    companyId: null,
    muId: null,
  });
});
```

Add `fetchUserByIdBatch` tests mirroring `fetchUserLiteBatch` (dedupe, failed slot → null, missing `requestBatch` throws).

- [ ] **Step 2: Run `vp test src/warera/users.test.ts`** — Expected: FAIL

- [ ] **Step 3: Implement parse + batch.** `fetchUserById` still uses `warera.request` + `wareraProcedurePath("user.getUserById", { userId })` (ID lookup, never search).

- [ ] **Step 4: Run tests** — Expected: PASS. Also `vp test src/skills/job-wage.ts` if that file exists as a test, otherwise grep compile via `vp test src/warera/users.test.ts src/server/routes/user.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/warera/users.ts src/warera/users.test.ts src/warera/index.ts src/skills/job-wage.ts
git commit -m "$(cat <<'EOF'
feat(warera): parse MU and username from user.getUserById

Follow sync needs current MU and workplace from an id lookup, not search.
EOF
)"
```

---

### Task 4: MU search for the add picker only

**Files:**
- Modify: `src/warera/search.ts`
- Create: `src/warera/search.test.ts` (or modify if present)
- Modify: `src/server/routes/economy.ts`
- Create or modify: economy search tests (if none, add `src/server/routes/economy-search.test.ts`)

**Interfaces:**
- Consumes: `search.searchAnything` (already used for users)
- Produces:

```ts
export type SearchMuHit = { muId: string; name: string };
export async function searchMus(warera: WareraRequester, searchText: string, limit?: number): Promise<SearchMuHit[]>
```

`GET /api/economy/search?q=&type=user|mu` — `type` defaults to `user`. User response stays `{ users }`. MU response `{ mus: SearchMuHit[] }`.

- [ ] **Step 1: Failing tests for `searchMus`**

Mock `request` for `search.searchAnything` returning `{ result: { data: { muIds: ["m1"] } } }` then `mu.getById` (or lite fields on the search payload if `name` is present). If search returns objects `{ _id, name }`, parse those and **do not** call `mu.getById` in the picker (picker may call getById only on Add). Prefer: parse `muIds` + optional names from the search payload; if only ids, fetch `mu.getById` for names like `searchUsers` does with `user.getUserLite`.

Keep `searchUsers` behavior unchanged.

- [ ] **Step 2: Economy route tests**

`GET /search?q=ab` → still `{ users: [...] }` (default type).  
`GET /search?q=ab&type=mu` → `{ mus: [...] }`.  
`type=nope` → 400.  
`q` length < 2 → 400 (existing).

- [ ] **Step 3: Implement** `searchMus` and the `type` query. Do not use search in any job.

- [ ] **Step 4: Run** `vp test src/warera/search.test.ts src/server/routes/economy-search.test.ts` (adjust paths to the files you created)

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/search.ts src/warera/search.test.ts src/server/routes/economy.ts src/server/routes/economy-search.test.ts
git commit -m "$(cat <<'EOF'
feat(api): search MUs by name for the follow add picker

Collection still uses stored ids; search only resolves a name to an id in the UI.
EOF
)"
```

---

### Task 5: `syncFollowedPlayers`

**Files:**
- Create: `src/jobs/sync-followed-players.ts`
- Create: `src/jobs/sync-followed-players.test.ts`

**Interfaces:**
- Consumes: `listDistinctFollowedPlayerIds`, `upsertPlayerCurrent`, `reconcileFollowPlayerMu`, `fetchUserByIdBatch`
- Produces:

```ts
export async function syncFollowedPlayers(options: {
  db: Db;
  warera: WareraRequester;
  now?: Date;
}): Promise<{ playerCount: number; errors: string[] }>
```

Behavior: distinct followed ids → `fetchUserByIdBatch` → for each ok hit, `upsertPlayerCurrent` + `reconcileFollowPlayerMu`. Failed/null hits: push error string `player ${id}: lookup failed`, skip reconcile (leave previous current + follow_player rows). Empty list: `{ playerCount: 0, errors: [] }`. Never call `search.*`.

- [ ] **Step 1: Write failing tests** with in-memory tables (`player_watch_reasons`, `mu_watch_reasons`, `players`) and a mocked `requestBatch`:

1. One followed player with `mu: "mu-1"` → players row + one `follow_player` reason.
2. Same player later `mu: "mu-2"` → old follow row gone, new present; extra `manual` on mu-1 remains.
3. Batch slot fail → error listed, no throw.
4. Mock `request` must not be called with a path containing `search.`.

- [ ] **Step 2: Run** `vp test src/jobs/sync-followed-players.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement** the helper. If `requestBatch` is missing, throw (production client always has it); tests must pass a mock `requestBatch`.

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/jobs/sync-followed-players.ts src/jobs/sync-followed-players.test.ts
git commit -m "$(cat <<'EOF'
feat(jobs): sync followed players by id and reconcile MU follow reasons

Keeps MU follow_player rows aligned with each followed player’s current MU.
EOF
)"
```

---

### Task 6: MU poll reads reason ids

**Files:**
- Modify: `src/db/mus.ts` (remove `ensureSeedMu`; `listMusForSync` reads `listDistinctWatchedMuIds`)
- Modify: `src/db/mus.test.ts` (delete empty-watchlist seed test; add “lists ids from reasons not mus rows”)
- Modify: `src/jobs/mu-stats-poll/run.ts`
- Modify: `src/jobs/mu-stats-poll/run.test.ts`
- Modify: `src/jobs/mu-stats-poll/index.ts` (description: reasons, not mus row presence)

**Interfaces:**
- Consumes: `listDistinctWatchedMuIds`, `syncFollowedPlayers`
- Produces: same `runMuStatsPoll` return shape as today

- [ ] **Step 1: Update `mus.test.ts`**

Replace `ensureSeedMu` test with: insert a `mus` row **without** a reason → `listMusForSync` is empty; insert `mu_watch_reasons` manual → id is listed.

Create `mu_watch_reasons` in the test schema SQL.

- [ ] **Step 2: Change `listMusForSync`** to return `listDistinctWatchedMuIds(db)` (or equivalent select). Remove `ensureSeedMu`.

- [ ] **Step 3: Update `runMuStatsPoll`**

```ts
await syncFollowedPlayers({ db, warera, now: recordedAt });
const watchlist = await listMusForSync(db);
if (watchlist.length === 0) {
  logger.info({ muCount: 0 }, "mu stats poll complete");
  // still insert a poll row? Spec: no-op success. Insert mu_polls status=success mu_count=0 member_count=0 so Jobs UI shows a run, then return.
}
```

Prefer inserting a success poll with zero counts (matches “no-op success” and existing poll table). Do **not** call `ensureSeedMu`.

When watchlist is non-empty, keep the existing per-MU fetch/snapshot loop.

- [ ] **Step 4: Update `run.test.ts`**

Create `player_watch_reasons`, `mu_watch_reasons`, `players`. Seed a **reason** for `SEED_MU_ID` (not empty-mus seed). Empty `mus` table + reason row must still call `mu.getById` for that id.

Add a test: `mus` has an extra id with **no** reason → that id is not fetched.

Mock `requestBatch` for `syncFollowedPlayers` (empty followed players is fine).

- [ ] **Step 5: Run** `vp test src/db/mus.test.ts src/jobs/mu-stats-poll/run.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/mus.ts src/db/mus.test.ts src/jobs/mu-stats-poll/
git commit -m "$(cat <<'EOF'
feat(mu): poll distinct watch-reason ids instead of mus row presence

Follow and manual reasons can overlap without sharing a single watchlist flag.
EOF
)"
```

---

### Task 7: Work-stat client (POST batch + parsers)

**Files:**
- Modify: `src/warera/trpc.ts` — add POST batch path helper
- Modify: `src/warera/client.ts` — `requestBatch` uses POST when `init.method === "POST"`
- Modify: `src/warera/client.test.ts`
- Create: `src/warera/work-stats.ts`
- Create: `src/warera/work-stats.test.ts`
- Modify: `.agents/skills/warera-api/SKILL.md`

**Interfaces:**
- Consumes: `WareraRequester.requestBatch`, `API2_TRPC_BASE`
- Produces:

```ts
export const WORK_STATS_DAYS = 14;

export type CompanyWorkDay = {
  dailyDate: string;
  automatedEngine: number | null;
  employeeProd: number | null;
  selfWork: number | null;
  total: number | null;
  wage: number | null;
  payload: Record<string, unknown> | null;
};

export type WorkerWorkDay = {
  dailyDate: string;
  employeeProd: number | null;
  total: number | null;
  wage: number | null;
  payload: Record<string, unknown> | null;
};

export function parseCompanyWorkDays(raw: unknown): CompanyWorkDay[]
export function parseWorkerWorkDays(raw: unknown): WorkerWorkDay[]

export async function fetchWorkStatsBatch(
  warera: WareraRequester,
  input: {
    companyIds: string[];
    workerTargets: { companyId: string; workerId: string }[];
  },
): Promise<{
  companies: Map<string, CompanyWorkDay[] | null>; // null = slot failed
  workers: Map<string, WorkerWorkDay[] | null>; // key `${companyId}\t${workerId}`
}>
```

POST batch: path `procA,procB?batch=1` (no `input` query); body `JSON.stringify({ "0": input0, "1": input1 })` matching GET’s indexed input object. Headers: `content-type: application/json`, `authStyle: "api-key"`, `baseUrl: API2_TRPC_BASE`.

Chunk POST batches if the procedure-list URL exceeds `WARERA_MAX_BATCH_URL_LENGTH` (reuse a path helper without the input query).

`fetchWorkStatsBatch` must throw if `requestBatch` is missing.

- [ ] **Step 1: Failing client test** — `requestBatch(items, { method: "POST", authStyle: "api-key", baseUrl: API2 })` POSTs one URL ending in `?batch=1`, body is the index record, `X-API-Key` set, method POST.

- [ ] **Step 2: Implement POST branch in `requestBatch`.** GET path stays the default when method is omitted.

- [ ] **Step 3: Parser tests** using the spec payloads:

Company:

```json
[{ "automatedEngine": 171, "dailyDate": "2026-08-19", "employeeProd": 1221.75, "selfWork": 49.45, "total": 1442.2, "wage": 130.287 }]
```

Worker:

```json
[{ "dailyDate": "2026-08-16", "employeeProd": 65, "total": 65, "wage": 6.8500000000000005 }]
```

Also unwrap `{ result: { data: [...] } }` via `unwrapTrpcData` in fetch, not in parse (parse receives the array). Skip rows without `dailyDate`.

- [ ] **Step 4: `fetchWorkStatsBatch` test** — mock `requestBatch` to assert items are `work.getStatsByCompany` `{ companyId, days: 14 }` and `work.getStatsByWorkerAndCompany` `{ companyId, workerId, days: 14 }`, and `init` includes `method: "POST"`, `authStyle: "api-key"`, `baseUrl` containing `api2.warera.io`.

- [ ] **Step 5: Skill note** in `.agents/skills/warera-api/SKILL.md` endpoint index:

Add namespace `work` procedures `getStatsByCompany`, `getStatsByWorkerAndCompany` with a new footnote: not on official OpenAPI; force **api2 POST** + `X-API-Key` (same class as recommended regions / MU members).

- [ ] **Step 6: Run** `vp test src/warera/client.test.ts src/warera/work-stats.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/warera/client.ts src/warera/client.test.ts src/warera/trpc.ts src/warera/work-stats.ts src/warera/work-stats.test.ts src/warera/index.ts .agents/skills/warera-api/SKILL.md
git commit -m "$(cat <<'EOF'
feat(warera): batch-fetch daily work stats from api2

Use POST + API key for the undocumented work.getStats procedures.
EOF
)"
```

---

### Task 8: Work-stat upsert helpers

**Files:**
- Create: `src/db/work-stats.ts`
- Create: `src/db/work-stats.test.ts`

**Interfaces:**

```ts
export async function upsertCompanyWorkDays(
  db: Db,
  companyId: string,
  days: CompanyWorkDay[],
  fetchedAt: Date,
): Promise<number> // rows written

export async function upsertWorkerWorkDays(
  db: Db,
  target: { companyId: string; workerId: string },
  days: WorkerWorkDay[],
  fetchedAt: Date,
): Promise<number>
```

Use `insert().onConflictDoUpdate` on the primary key. Second upsert with a different `total` overwrites.

- [ ] **Step 1: Failing tests** — insert two days; upsert same `(company, date)` with new total; worker key is company+worker+date (same worker, two companies → two rows).

- [ ] **Step 2: Implement**

- [ ] **Step 3: Run** `vp test src/db/work-stats.test.ts` — Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/db/work-stats.ts src/db/work-stats.test.ts
git commit -m "$(cat <<'EOF'
feat(db): upsert company and worker work stats by day

Re-polling refreshes today and recent days without appending duplicates.
EOF
)"
```

---

### Task 9: `work-stats-poll` job

**Files:**
- Create: `src/jobs/work-stats-poll/run.ts`
- Create: `src/jobs/work-stats-poll/index.ts`
- Create: `src/jobs/work-stats-poll/run.test.ts`
- Modify: `src/jobs/registry.ts` — register after `muStatsPollJob`
- Modify: `docs/warera-api/inventory.md`
- Modify: `AGENTS.md` (data-tier table + user-watchlist exception)

**Interfaces:**
- Consumes: `syncFollowedPlayers`, `fetchCompaniesByUserId`, `fetchWorkers`, `fetchWorkStatsBatch`, upsert helpers
- Produces:

```ts
export async function runWorkStatsPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{
  playerCount: number;
  companyCount: number;
  workerCount: number;
  companyDays: number;
  workerDays: number;
  status: "success" | "partial" | "error";
}>
```

JobDefinition:

```ts
id: "work-stats-poll"
name: "Work Stats Poll"
description: "Hourly upsert of company and worker daily work stats for followed players’ factories"
defaultCron: "0 10 * * * *"
defaultEnabled: true
```

Algorithm:

1. `syncFollowedPlayers`.
2. If no followed players → status `success`, all counts 0.
3. For each followed player id: `fetchCompaniesByUserId` (owned). Collect company ids. Per-player failure → error string, continue.
4. Unique owned company ids: `fetchWorkers({ companyId })` → worker targets. Per-company failure → error, skip that company’s workers (still try company stats).
5. Load `players.workplace_company_id` for followed ids; add `(workplace, playerId)` if workplace set and pair not already in targets. **Do not** fetch workers for a workplace that is not owned.
6. `fetchWorkStatsBatch`. Null maps → per-target error, continue.
7. Upsert successful arrays. `companyDays` / `workerDays` = sum of upserted row counts.
8. Status: no targets and no errors → success; all targets failed → error; mix → partial; no errors → success.
9. Log flat primitives: `player_count`, `company_count`, `worker_count`, `company_days`, `worker_days`, `status`, `errors` (count, not nested objects).

- [ ] **Step 1: Write `run.test.ts`** with mocked `request` / `requestBatch`:

Fixture: followed player `u1`, `getUserById` workplace `foreign-co`, `getCompanies` returns `owned-co`, `getWorkers` for `owned-co` returns `u1` and `u2`.

Assert:

- `work.getStatsByCompany` only for `owned-co` (not `foreign-co`).
- Worker targets: `(owned-co, u1)`, `(owned-co, u2)`, `(foreign-co, u1)` only — **not** other workers at `foreign-co`.
- No `search.` in any path.
- Second run overwrites the same `daily_date` (call upsert path twice with different totals; last wins).

Also: empty follow list → success zeros; company fetch fail + other company ok → `partial`.

Test DB needs: reason tables, `players`, `mus` not required, work-stat tables.

- [ ] **Step 2: Run** `vp test src/jobs/work-stats-poll/run.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement `run.ts` + `index.ts` + registry**

- [ ] **Step 4: Update inventory**

- User section: add **Followed players** (reasons + `players` current; jobs + Follow CRUD).
- User or job-owned: **Work daily stats** — `work-stats-poll` hourly at :10; api2 POST; upsert `company_work_stats` / `worker_work_stats`.
- Geo MU row: watchlist is `mu_watch_reasons` distinct ids, not `mus` row presence; seed via migrate manual reason.

Last reviewed date: `2026-08-20`.

- [ ] **Step 5: Update `AGENTS.md` data tiers**

Geo MU line: reasons watchlist. Add rule exception: **Followed players** are a bounded user watchlist jobs may refresh; shell selected player stays demand-driven.

- [ ] **Step 6: Run** `vp test src/jobs/work-stats-poll/run.test.ts src/jobs/mu-stats-poll/run.test.ts` and `vp check`

Expected: PASS / check clean

- [ ] **Step 7: Commit**

```bash
git add src/jobs/work-stats-poll src/jobs/registry.ts docs/warera-api/inventory.md AGENTS.md
git commit -m "$(cat <<'EOF'
feat(jobs): poll daily work stats for followed players’ companies

Employer totals and per-employee days are upserted hourly from api2.
EOF
)"
```

---

### Task 10: Follow API routes

**Files:**
- Create: `src/server/routes/follow.ts`
- Create: `src/server/routes/follow.test.ts`
- Modify: `src/server/app.ts` — `app.route("/api/follow", followRoutes({ db, warera, logger }))`

**Interfaces:**

```
GET  /api/follow/players → { players: Array<{
  playerId: string;
  username: string | null;
  muId: string | null;
  workplaceCompanyId: string | null;
  reasons: Array<{ reason: string; sourceId: string }>;
}> }

POST /api/follow/players  JSON { playerId: string }
  → 200 { player: <same shape> }
  → 400 missing/empty playerId
  → 502 if user.getUserById fails (HttpError upstream_error)

DELETE /api/follow/players/:playerId
  → deletes player_watch_reasons for that id (all reasons in v1: manual)
  → deleteFollowPlayerReasonsForSource(playerId)
  → 200 { ok: true }
  → 404 if no player reason rows existed

GET  /api/follow/mus → { mus: Array<{
  muId: string;
  name: string | null;
  reasons: Array<{ reason: string; sourceId: string; sourceUsername: string | null }>;
}> }

POST /api/follow/mus JSON { muId: string }
  → insert manual reason; fetchMuById; upsertMuCurrent
  → 502 on getById failure (do not leave a dangling reason: delete the manual row you inserted, or insert only after fetch succeeds — prefer fetch first, then insert reason + upsert)

DELETE /api/follow/mus/:muId
  → delete only (muId, manual, '')
  → 404 if that manual row did not exist
  → follow_player rows stay
```

POST player: `fetchUserById` by body id (not search) → insert manual reason → upsertPlayerCurrent → `reconcileFollowPlayerMu`. Duplicate POST is 200 idempotent.

Assert in tests: POST player does not call `search.*`.

- [ ] **Step 1: Write route tests** (Hono mount like `countries.test.ts`) with mocked `warera.request` / `requestBatch`.

- [ ] **Step 2: Run** `vp test src/server/routes/follow.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement routes.** Reuse `HttpError` codes: `invalid_body`, `not_found`, `upstream_error`.

- [ ] **Step 4: Run tests** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/follow.ts src/server/routes/follow.test.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
feat(api): CRUD for followed players and manual MU reasons

Add resolves entities by id after the operator supplies a WarEra id.
EOF
)"
```

---

### Task 11: Follow operator UI

**Files:**
- Create: `src/web/features/follow/types.ts`
- Create: `src/web/features/follow/IdSearchField.tsx` — id input + search-by-name that fills the id
- Create: `src/web/features/follow/FollowPage.tsx`
- Create: `src/web/routes/follow.tsx`
- Modify: `src/web/layout/Shell.tsx` — `{ to: "/follow", label: "Follow" }` next to Countries
- Do **not** hand-edit `routeTree.gen.ts`; TanStack Router plugin regenerates it on `vp run dev` / `vp check` / build

**Interfaces:**
- Consumes: `/api/follow/*`, `/api/economy/search?q=&type=user|mu`
- Produces: `/follow` page with Players and MUs sections (Countries-style tables)

`IdSearchField` props:

```ts
{
  id: string;
  onIdChange: (id: string) => void;
  searchType: "user" | "mu";
  disabled?: boolean;
}
```

Search: `q.trim().length >= 2`, debounce ~300ms (same as `CompaniesPlayerSearch`). Clicking a hit sets `onIdChange(hit.userId | hit.muId)`. Do not POST follow until the Add button. Show username/name next to results.

Players table columns: username, player id, MU id, workplace, reasons, Remove (manual).  
MUs table: name, mu id, reasons (`follow_player` show source username, not a remove button; `manual` has Remove).

Add forms: prevent submit if id empty. On API error, show the message.

- [ ] **Step 1: Implement `IdSearchField` + `FollowPage` + route + nav**

Use existing `Button`, `Input`, `Table` from `@/components/ui/*` and `api()` from `src/web/api`. Dark war-command look; no new chart libs.

- [ ] **Step 2: Run `vp check`** so format/lint/typecheck and route generation run.

Expected: PASS. If `routeTree.gen.ts` changed, include it in the commit.

- [ ] **Step 3: Commit**

```bash
git add src/web/features/follow src/web/routes/follow.tsx src/web/layout/Shell.tsx src/web/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(web): add Follow pages to manage player and MU watch reasons

Operators can paste an id or search a name; collection still uses the stored id.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Reason tables + PK `(subject, reason, source_id)` | 1–2 |
| `players` current entity | 1–2, 5 |
| `mus` no longer watchlist; migrate backfill / seed | 1, 6 |
| `syncFollowedPlayers` + follow_player reconcile | 5–6, 10 |
| Work upsert by day; hourly `:10` | 8–9 |
| Owned company full roster + workplace-only extra | 9 |
| Batch work stats POST api2 + skill note | 7, 9 |
| Jobs never search | 5, 6, 9, 10 tests |
| Search picker only on add | 4, 11 |
| Follow CRUD + UI | 10–11 |
| Inventory + AGENTS exception | 9 |
| No charts / no company-reasons / no search TTL | omitted by design |

No TBD placeholders. Names used later (`syncFollowedPlayers`, `listDistinctWatchedMuIds`, `fetchWorkStatsBatch`, `WATCH_REASON_MANUAL`) are defined in earlier tasks.
