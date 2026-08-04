# Item Market Transactions Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest WarEra `itemMarket` sale transactions into append-only local history via a once-per-boot backfill job and a frequent poll job, with Croner `maxRuns` / overrun recording — no UI.

**Architecture:** Shared cursor walk over `transaction.getPaginatedTransactions` (`transactionType: "itemMarket"`). Backfill (`maxRuns: 1`) walks gently ~24h then sets an in-process handoff flag; poll (every minute) stays idle until handoff, then catch-up until known `_id`. Job runner records overrun attempts as failed `job_runs` without corrupting an active `running` status.

**Tech Stack:** TypeScript, Drizzle/Turso (libsql), Croner, Vitest via `vp test`, Vite+ (`vp check` / `vp run db:generate`).

**Design:** [2026-08-04-item-market-transactions-design.md](../specs/2026-08-04-item-market-transactions-design.md)

## Global Constraints

- No UI, charts, or Hono read routes in this slice
- Global tier: Croner owns refresh; only `itemMarket` (not commodity `trading`)
- PK = WarEra transaction `_id`; insert conflict-do-nothing
- Typed columns; JSON only for `skills` + leftover `payload`
- Handoff flag: in-process only; set after backfill’s first successful page; never on backfill failure
- Prefer gateway for the procedure; use existing `WareraRequester` / rate limiter
- Prefer `vp test` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | `item_market_transactions` + `jobs.maxRuns` |
| `drizzle/0008_*.sql` (+ meta) | Migration via `vp run db:generate` |
| `src/db/item-market-transactions.ts` | Insert-ignore + existence helpers |
| `src/db/item-market-transactions.test.ts` | Conflict / round-trip tests |
| `src/warera/transactions.ts` | Parse + fetch paginated itemMarket txs |
| `src/warera/transactions.test.ts` | Parser + path tests |
| `src/warera/index.ts` | Re-exports |
| `src/jobs/item-market-tx/handoff.ts` | In-process poll handoff flag |
| `src/jobs/item-market-tx/ingest.ts` | Shared page walk |
| `src/jobs/item-market-tx/ingest.test.ts` | Walk / cutoff / handoff tests |
| `src/jobs/item-market-tx-backfill/index.ts` + `run.ts` | Backfill JobDefinition |
| `src/jobs/item-market-tx-poll/index.ts` + `run.ts` | Poll JobDefinition |
| `src/jobs/item-market-tx-poll/run.test.ts` | Poll waits / catch-up (mocked) |
| `src/jobs/types.ts` | `defaultMaxRuns?: number` |
| `src/jobs/registry.ts` | Seed `max_runs`; register both jobs |
| `src/jobs/scheduler.ts` | Await `runJob`; `maxRuns`; protect callback |
| `src/jobs/runner.ts` | Record overrun as failed `job_runs` (keep `last_status` if still running) |
| `src/jobs/runner.test.ts` | Overrun recording helper tests |
| `AGENTS.md` | One-liner under Global / jobs |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0008_*.sql` + `drizzle/meta/*` via generate

**Interfaces:**
- Consumes: existing drizzle sqlite patterns in `schema.ts`
- Produces: `jobs.maxRuns` column; table `itemMarketTransactions` / `item_market_transactions`

- [ ] **Step 1: Add `maxRuns` to `jobs` and append `itemMarketTransactions`**

In `src/db/schema.ts`, add to the `jobs` table definition (after `cron`):

```ts
  maxRuns: integer("max_runs"),
```

Append (after existing MU tables is fine):

```ts
export const itemMarketTransactions = sqliteTable(
  "item_market_transactions",
  {
    id: text("id").primaryKey(),
    money: real("money").notNull(),
    itemCode: text("item_code").notNull(),
    quantity: integer("quantity").notNull(),
    sellerId: text("seller_id").notNull(),
    buyerId: text("buyer_id").notNull(),
    transactionType: text("transaction_type").notNull(),
    itemId: text("item_id").notNull(),
    itemType: text("item_type"),
    itemState: integer("item_state"),
    itemMaxState: integer("item_max_state"),
    itemQuantity: integer("item_quantity"),
    itemLastAcquisitionAt: integer("item_last_acquisition_at", { mode: "timestamp_ms" }),
    skills: text("skills", { mode: "json" }).$type<Record<string, unknown> | null>(),
    offerCreatedAt: integer("offer_created_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    ingestedAt: integer("ingested_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("item_market_tx_item_code_created_at_idx").on(t.itemCode, t.createdAt),
    index("item_market_tx_created_at_idx").on(t.createdAt),
  ],
);
```

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate`

Expected: new `drizzle/0008_*.sql` altering `jobs` and creating `item_market_transactions` (+ meta journal/snapshot updates).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): item_market_transactions + jobs.max_runs"
```

---

### Task 2: Job infra — maxRuns, await Cron, overrun recording

**Files:**
- Modify: `src/jobs/types.ts`
- Modify: `src/jobs/registry.ts`
- Modify: `src/jobs/scheduler.ts`
- Modify: `src/jobs/runner.ts`
- Modify: `src/jobs/runner.test.ts`

**Interfaces:**
- Consumes: Croner `protect` callback + `maxRuns` option
- Produces:
  - `JobDefinition.defaultMaxRuns?: number`
  - `OVERUN_MESSAGE` / `recordJobOverrun(db, logger, jobId)` (or export constant `"job already running"`)
  - Scheduler awaits `runJob` so protect can fire
  - Overlap: insert failed `job_runs`; **do not** set `jobs.last_status` to `error` while an active run still holds `running` (would allow a second start). Log + `job_runs` only. In-process / DB overlap still returns `{ started: false, skippedReason }`.

- [ ] **Step 1: Extend `JobDefinition`**

In `src/jobs/types.ts`:

```ts
export type JobDefinition = {
  id: string;
  name: string;
  description: string;
  defaultCron: string; // 6-field cron
  defaultEnabled?: boolean;
  /** Mapped to Croner maxRuns; omit / undefined = infinite. */
  defaultMaxRuns?: number;
  run: (ctx: JobContext) => Promise<string | void>;
};
```

- [ ] **Step 2: Seed `max_runs` on insert only in `syncJobsToDb`**

```ts
await db
  .insert(jobs)
  .values({
    id: def.id,
    name: def.name,
    description: def.description,
    cron: def.defaultCron,
    enabled: def.defaultEnabled ?? true,
    maxRuns: def.defaultMaxRuns ?? null,
  })
  .onConflictDoUpdate({
    target: jobs.id,
    set: {
      name: def.name,
      description: def.description,
      // do not overwrite cron, enabled, or maxRuns
    },
  });
```

- [ ] **Step 3: Add `recordJobOverrun` and use it on overlap in `runner.ts`**

Export:

```ts
export const OVERUN_MESSAGE = "job already running";

export async function recordJobOverrun(
  db: Db,
  logger: Logger,
  jobId: string,
): Promise<void> {
  const now = new Date();
  await db.insert(jobRuns).values({
    jobId,
    startedAt: now,
    finishedAt: now,
    status: "error",
    message: OVERUN_MESSAGE,
    durationMs: 0,
  });
  logger.warn({ jobId }, "job overrun blocked");
  // Intentionally do not change jobs.last_status while a real run may still be running.
}
```

In `runJob` when `inflightJobs.has(def.id)`: `await recordJobOverrun(...)` then return `{ started: false, skippedReason: OVERUN_MESSAGE }`.

In `runJobLocked` when `lastStatus === "running"` and not stale: same `recordJobOverrun` then return skipped (replace silent skip). Keep the existing string constant in sync (`SKIP_ALREADY_RUNNING` can become `OVERUN_MESSAGE` or alias).

- [ ] **Step 4: Write failing / update tests in `runner.test.ts`**

Add an in-memory jobs + job_runs DDL test (mirror other job DB tests) that:

1. Inserts a job row with `last_status: "running"`, recent `last_started_at`
2. Calls `recordJobOverrun`
3. Asserts a `job_runs` row with `status: "error"`, `message: OVERUN_MESSAGE`
4. Asserts `jobs.last_status` remains `"running"`

Also keep existing `isStaleRunning` tests.

- [ ] **Step 5: Run runner tests**

Run: `vp test src/jobs/runner.test.ts`

Expected: PASS

- [ ] **Step 6: Fix scheduler — await runJob, maxRuns, protect callback**

Replace the Cron construction in `scheduleOne` roughly as:

```ts
const cronExpr = resolveCron(row.cron, def.defaultCron, logger);
const maxRuns = row.maxRuns ?? def.defaultMaxRuns ?? undefined;

const protectCallback = () => {
  void recordJobOverrun(db, logger, def.id).catch((err) => {
    logger.error({ jobId: def.id }, "failed to record job overrun", err);
  });
};

const cronOpts: { protect: typeof protectCallback; name: string; maxRuns?: number } = {
  protect: protectCallback,
  name: def.id,
};
if (maxRuns != null && maxRuns > 0) {
  cronOpts.maxRuns = maxRuns;
}

const jobCron = new Cron(cronExpr, cronOpts, async () => {
  try {
    await runJob(db, logger, def, { keep: jobRunHistoryLimit, warera });
  } catch (err) {
    logger.error({ jobId: def.id }, "unhandled job error", err);
  }
});
```

**Critical:** the Cron callback must `await runJob`. Fire-and-forget (`void runJob`) makes Croner think the tick finished immediately, so `protect` never fires.

- [ ] **Step 7: Commit**

```bash
git add src/jobs/types.ts src/jobs/registry.ts src/jobs/scheduler.ts src/jobs/runner.ts src/jobs/runner.test.ts
git commit -m "feat(jobs): maxRuns, await cron ticks, record overruns"
```

---

### Task 3: WarEra transactions client

**Files:**
- Create: `src/warera/transactions.ts`
- Create: `src/warera/transactions.test.ts`
- Modify: `src/warera/index.ts`

**Interfaces:**
- Consumes: `wareraProcedurePath`, `unwrapTrpcData`, `WareraRequester`
- Produces:
  - `ItemMarketTransaction` type (mapped row fields)
  - `parseItemMarketTransactionsPage(data) → { items: ItemMarketTransaction[]; nextCursor: string | null }`
  - `fetchItemMarketTransactionsPage(warera, opts?: { cursor?: string; perPage?: number })`

- [ ] **Step 1: Write failing parser tests**

Create `src/warera/transactions.test.ts` with fixtures based on observed payloads:

```ts
import { describe, expect, it, vi } from "vite-plus/test";
import {
  fetchItemMarketTransactionsPage,
  parseItemMarketTransactionsPage,
} from "./transactions";

const equipmentTx = {
  _id: "6a720c0d8fe5b64f93cb3851",
  money: 37.79,
  itemCode: "chest4",
  quantity: 1,
  sellerId: "seller1",
  buyerId: "buyer1",
  transactionType: "itemMarket",
  item: {
    _id: "item1",
    type: "equipment",
    code: "chest4",
    skills: { armor: 22 },
    state: 100,
    maxState: 100,
    quantity: 1,
    lastAcquisitionAt: "2026-08-04T15:47:56.698Z",
  },
  offerCreatedAt: "2026-08-04T15:48:20.018Z",
  createdAt: "2026-08-04T15:58:05.369Z",
  updatedAt: "2026-08-04T15:58:05.369Z",
  __v: 0,
};

const weaponTx = {
  _id: "6a720bfad950f6985c6187a1",
  money: 38.599,
  itemCode: "sniper",
  quantity: 1,
  sellerId: "seller2",
  buyerId: "buyer2",
  transactionType: "itemMarket",
  item: {
    _id: "item2",
    code: "sniper",
    skills: { attack: 103, criticalChance: 16 },
    state: 100,
    maxState: 100,
    quantity: 1,
    lastAcquisitionAt: "2026-08-04T14:48:51.206Z",
  },
  offerCreatedAt: "2026-08-04T14:50:07.215Z",
  createdAt: "2026-08-04T15:57:46.814Z",
  updatedAt: "2026-08-04T15:57:46.814Z",
  __v: 0,
};

describe("parseItemMarketTransactionsPage", () => {
  it("maps equipment and weapon shapes", () => {
    const page = parseItemMarketTransactionsPage({
      items: [equipmentTx, weaponTx],
      cursor: "next-cur",
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("next-cur");
    expect(page.items[0]).toMatchObject({
      id: "6a720c0d8fe5b64f93cb3851",
      money: 37.79,
      itemCode: "chest4",
      itemType: "equipment",
      skills: { armor: 22 },
    });
    expect(page.items[1]).toMatchObject({
      id: "6a720bfad950f6985c6187a1",
      itemType: null,
      skills: { attack: 103, criticalChance: 16 },
    });
    expect(page.items[0].createdAt.toISOString()).toBe("2026-08-04T15:58:05.369Z");
  });

  it("accepts nextCursor alias", () => {
    const page = parseItemMarketTransactionsPage({ items: [], nextCursor: "n2" });
    expect(page.nextCursor).toBe("n2");
  });
});

describe("fetchItemMarketTransactionsPage", () => {
  it("calls getPaginatedTransactions with itemMarket", async () => {
    const request = vi.fn().mockResolvedValue({
      result: { data: { items: [equipmentTx], cursor: null } },
    });
    const page = await fetchItemMarketTransactionsPage({ request }, { perPage: 50 });
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("transaction.getPaginatedTransactions"),
    );
    const called = String(request.mock.calls[0][0]);
    expect(called).toContain("itemMarket");
    expect(page.items[0].id).toBe(equipmentTx._id);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `vp test src/warera/transactions.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/warera/transactions.ts`**

```ts
import type { WareraRequestInit } from "./client";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type ItemMarketTransaction = {
  id: string;
  money: number;
  itemCode: string;
  quantity: number;
  sellerId: string;
  buyerId: string;
  transactionType: string;
  itemId: string;
  itemType: string | null;
  itemState: number | null;
  itemMaxState: number | null;
  itemQuantity: number | null;
  itemLastAcquisitionAt: Date | null;
  skills: Record<string, unknown> | null;
  offerCreatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  payload: Record<string, unknown> | null;
};

export type ItemMarketTransactionsPage = {
  items: ItemMarketTransaction[];
  nextCursor: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function pickDate(obj: Record<string, unknown>, keys: string[]): Date | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function parseOne(raw: unknown): ItemMarketTransaction | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, ["_id", "id"]);
  const money = pickNumber(obj, ["money"]);
  const itemCode = pickString(obj, ["itemCode", "item_code"]);
  const quantity = pickNumber(obj, ["quantity"]);
  const sellerId = pickString(obj, ["sellerId", "seller_id"]);
  const buyerId = pickString(obj, ["buyerId", "buyer_id"]);
  const transactionType = pickString(obj, ["transactionType", "transaction_type"]);
  const createdAt = pickDate(obj, ["createdAt", "created_at"]);
  const item = asRecord(obj.item);
  const itemId = item ? pickString(item, ["_id", "id"]) : null;
  if (
    !id ||
    money == null ||
    !itemCode ||
    quantity == null ||
    !sellerId ||
    !buyerId ||
    !transactionType ||
    !createdAt ||
    !itemId
  ) {
    return null;
  }

  const knownTop = new Set([
    "_id",
    "id",
    "money",
    "itemCode",
    "quantity",
    "sellerId",
    "buyerId",
    "transactionType",
    "item",
    "offerCreatedAt",
    "createdAt",
    "updatedAt",
    "__v",
  ]);
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!knownTop.has(k)) payload[k] = v;
  }

  const skillsRaw = item?.skills;
  const skills = asRecord(skillsRaw);

  return {
    id,
    money,
    itemCode,
    quantity,
    sellerId,
    buyerId,
    transactionType,
    itemId,
    itemType: item ? pickString(item, ["type"]) : null,
    itemState: item ? pickNumber(item, ["state"]) : null,
    itemMaxState: item ? pickNumber(item, ["maxState", "max_state"]) : null,
    itemQuantity: item ? pickNumber(item, ["quantity"]) : null,
    itemLastAcquisitionAt: item
      ? pickDate(item, ["lastAcquisitionAt", "last_acquisition_at"])
      : null,
    skills,
    offerCreatedAt: pickDate(obj, ["offerCreatedAt", "offer_created_at"]),
    createdAt,
    updatedAt: pickDate(obj, ["updatedAt", "updated_at"]),
    payload: Object.keys(payload).length > 0 ? payload : null,
  };
}

export function parseItemMarketTransactionsPage(data: unknown): ItemMarketTransactionsPage {
  const obj = asRecord(data);
  const list = obj && Array.isArray(obj.items) ? obj.items : Array.isArray(data) ? data : [];
  const items = list.flatMap((row) => {
    const parsed = parseOne(row);
    return parsed ? [parsed] : [];
  });
  const nextCursor =
    (obj && typeof obj.nextCursor === "string" && obj.nextCursor) ||
    (obj && typeof obj.cursor === "string" && obj.cursor) ||
    null;
  return { items, nextCursor };
}

export async function fetchItemMarketTransactionsPage(
  warera: WareraRequester,
  opts: { cursor?: string; perPage?: number } = {},
  init?: WareraRequestInit,
): Promise<ItemMarketTransactionsPage> {
  const input: Record<string, unknown> = {
    transactionType: "itemMarket",
    perPage: opts.perPage ?? 50,
  };
  if (opts.cursor) input.cursor = opts.cursor;
  const json = await warera.request<unknown>(
    wareraProcedurePath("transaction.getPaginatedTransactions", input),
    init,
  );
  return parseItemMarketTransactionsPage(unwrapTrpcData(json));
}
```

- [ ] **Step 4: Re-export from `src/warera/index.ts`**

```ts
export {
  fetchItemMarketTransactionsPage,
  parseItemMarketTransactionsPage,
  type ItemMarketTransaction,
  type ItemMarketTransactionsPage,
} from "./transactions";
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `vp test src/warera/transactions.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/warera/transactions.ts src/warera/transactions.test.ts src/warera/index.ts
git commit -m "feat(warera): parse itemMarket paginated transactions"
```

---

### Task 4: DB insert helpers

**Files:**
- Create: `src/db/item-market-transactions.ts`
- Create: `src/db/item-market-transactions.test.ts`

**Interfaces:**
- Consumes: `itemMarketTransactions` schema; `ItemMarketTransaction` from warera (or a local row type)
- Produces:
  - `insertItemMarketTransactionsIgnoreConflicts(db, rows) → { inserted: number; existingIds: string[] }`
  - `findExistingItemMarketTransactionIds(db, ids: string[]) → Set<string>`

- [ ] **Step 1: Write failing DB tests**

Use in-memory libsql DDL matching the table (same pattern as `mu-stats.test.ts`).

```ts
// asserts: insert twice → second yields existingIds containing id, row count still 1
// asserts: skills JSON round-trips
```

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/db/item-market-transactions.test.ts`

- [ ] **Step 3: Implement helpers**

```ts
import { inArray } from "drizzle-orm";
import type { ItemMarketTransaction } from "../warera/transactions";
import type { Db } from "./client";
import { itemMarketTransactions } from "./schema";

export async function findExistingItemMarketTransactionIds(
  db: Db,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: itemMarketTransactions.id })
    .from(itemMarketTransactions)
    .where(inArray(itemMarketTransactions.id, ids));
  return new Set(rows.map((r) => r.id));
}

export async function insertItemMarketTransactionsIgnoreConflicts(
  db: Db,
  txs: ItemMarketTransaction[],
  ingestedAt: Date = new Date(),
): Promise<{ inserted: number; existingIds: string[] }> {
  if (txs.length === 0) return { inserted: 0, existingIds: [] };
  const existing = await findExistingItemMarketTransactionIds(
    db,
    txs.map((t) => t.id),
  );
  const existingIds = [...existing];
  const fresh = txs.filter((t) => !existing.has(t.id));
  if (fresh.length > 0) {
    await db
      .insert(itemMarketTransactions)
      .values(
        fresh.map((t) => ({
          id: t.id,
          money: t.money,
          itemCode: t.itemCode,
          quantity: t.quantity,
          sellerId: t.sellerId,
          buyerId: t.buyerId,
          transactionType: t.transactionType,
          itemId: t.itemId,
          itemType: t.itemType,
          itemState: t.itemState,
          itemMaxState: t.itemMaxState,
          itemQuantity: t.itemQuantity,
          itemLastAcquisitionAt: t.itemLastAcquisitionAt,
          skills: t.skills,
          offerCreatedAt: t.offerCreatedAt,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          payload: t.payload,
          ingestedAt,
        })),
      )
      .onConflictDoNothing();
  }
  return { inserted: fresh.length, existingIds };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `vp test src/db/item-market-transactions.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/db/item-market-transactions.ts src/db/item-market-transactions.test.ts
git commit -m "feat(db): insert-ignore item market transactions"
```

---

### Task 5: Shared ingest walk + handoff

**Files:**
- Create: `src/jobs/item-market-tx/handoff.ts`
- Create: `src/jobs/item-market-tx/ingest.ts`
- Create: `src/jobs/item-market-tx/ingest.test.ts`

**Interfaces:**
- Consumes: `fetchItemMarketTransactionsPage`, insert helpers, Logger, Db, WareraRequester
- Produces:
  - `isItemMarketTxPollEnabled()` / `enableItemMarketTxPoll()` / `resetItemMarketTxHandoffForTests()`
  - `walkItemMarketTransactions(opts) → { pages: number; inserted: number; stoppedReason: string }`
  - opts: `{ db, warera, logger, mode: "backfill" | "poll"; pageDelayMs?: number; lookbackMs?: number; now?: Date; perPage?: number }`

**Stop rules:**
- After each successful page in **backfill**: call `enableItemMarketTxPoll()` (first page is enough; calling again is fine).
- Stop if `existingIds.length > 0` after insert helper (known id on page) — still counted inserts for fresh rows on that page.
- Backfill only: stop if oldest `createdAt` on page `< now - lookbackMs` (default `24 * 60 * 60 * 1000`).
- Stop if `items.length === 0` or `nextCursor == null`.
- Between pages in backfill: `await sleep(pageDelayMs)` (default `300`).
- Poll mode: no delay; no lookback cutoff; does **not** touch handoff.

- [ ] **Step 1: Write ingest tests with mocked `fetchItemMarketTransactionsPage`**

Use `vi.mock` on `../../warera/transactions` or inject a `fetchPage` dependency on `walkItemMarketTransactions` for testability.

**Prefer dependency injection** so tests stay simple:

```ts
export type FetchItemMarketPage = (opts: {
  cursor?: string;
  perPage?: number;
}) => Promise<ItemMarketTransactionsPage>;
```

Pass `fetchPage` into walk (production wrappers pass warera-backed fetch).

Cover:
1. Backfill enables handoff after first successful page even if later stop
2. Mid-page known id → stop, do not request next cursor
3. Backfill 24h cutoff stops without requiring known id
4. Poll does not enable handoff

Reset handoff in `beforeEach` via `resetItemMarketTxHandoffForTests()`.

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/jobs/item-market-tx/ingest.test.ts`

- [ ] **Step 3: Implement handoff + ingest**

`handoff.ts`:

```ts
let pollEnabled = false;

export function isItemMarketTxPollEnabled(): boolean {
  return pollEnabled;
}

export function enableItemMarketTxPoll(): void {
  pollEnabled = true;
}

export function resetItemMarketTxHandoffForTests(): void {
  pollEnabled = false;
}
```

`ingest.ts`: implement walk with injected `fetchPage` + db insert helper; on backfill after each successful fetch/handle, `enableItemMarketTxPoll()`.

- [ ] **Step 4: Run — expect PASS**

Run: `vp test src/jobs/item-market-tx/ingest.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/jobs/item-market-tx/
git commit -m "feat(jobs): item market tx ingest walk and handoff"
```

---

### Task 6: Backfill + poll jobs + registry + AGENTS

**Files:**
- Create: `src/jobs/item-market-tx-backfill/run.ts`
- Create: `src/jobs/item-market-tx-backfill/index.ts`
- Create: `src/jobs/item-market-tx-poll/run.ts`
- Create: `src/jobs/item-market-tx-poll/index.ts`
- Create: `src/jobs/item-market-tx-poll/run.test.ts`
- Modify: `src/jobs/registry.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: ingest walk, handoff, JobContext
- Produces: registered jobs `item-market-tx-backfill`, `item-market-tx-poll`

- [ ] **Step 1: Implement backfill job**

`run.ts`:

```ts
import { fetchItemMarketTransactionsPage } from "../../warera/transactions";
import { walkItemMarketTransactions } from "../item-market-tx/ingest";
import type { JobContext } from "../types";

const PAGE_DELAY_MS = 300;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function runItemMarketTxBackfill(ctx: JobContext) {
  const result = await walkItemMarketTransactions({
    db: ctx.db,
    logger: ctx.logger,
    mode: "backfill",
    pageDelayMs: PAGE_DELAY_MS,
    lookbackMs: LOOKBACK_MS,
    fetchPage: (opts) => fetchItemMarketTransactionsPage(ctx.warera, opts),
  });
  return `backfill: ${result.inserted} inserted, ${result.pages} pages (${result.stoppedReason})`;
}
```

`index.ts`:

```ts
import type { JobDefinition } from "../types";
import { runItemMarketTxBackfill } from "./run";

export const itemMarketTxBackfillJob: JobDefinition = {
  id: "item-market-tx-backfill",
  name: "Item Market TX Backfill",
  description:
    "Once per process: walk itemMarket sales back ~24h (or until known ids); enables poll handoff after first page",
  defaultCron: "* * * * * *",
  defaultMaxRuns: 1,
  defaultEnabled: true,
  async run(ctx) {
    return runItemMarketTxBackfill(ctx);
  },
};
```

- [ ] **Step 2: Implement poll job**

```ts
import { fetchItemMarketTransactionsPage } from "../../warera/transactions";
import { isItemMarketTxPollEnabled } from "../item-market-tx/handoff";
import { walkItemMarketTransactions } from "../item-market-tx/ingest";
import type { JobContext } from "../types";

export async function runItemMarketTxPoll(ctx: JobContext) {
  if (!isItemMarketTxPollEnabled()) {
    return "waiting for backfill handoff";
  }
  const result = await walkItemMarketTransactions({
    db: ctx.db,
    logger: ctx.logger,
    mode: "poll",
    fetchPage: (opts) => fetchItemMarketTransactionsPage(ctx.warera, opts),
  });
  return `poll: ${result.inserted} inserted, ${result.pages} pages (${result.stoppedReason})`;
}
```

`index.ts`: `defaultCron: "0 * * * * *"` (every minute at second 0), no `defaultMaxRuns`.

- [ ] **Step 3: Poll unit test**

`run.test.ts`: with handoff false, `runItemMarketTxPoll` returns waiting message and never calls fetch (inject via temporarily not enabling handoff + mock warera request count 0). With handoff true + mocked page containing known id, inserts new only / stops.

Use in-memory DB DDL for `item_market_transactions` + handoff reset.

- [ ] **Step 4: Register jobs**

In `registry.ts` import and append both definitions to `listJobDefinitions()`.

- [ ] **Step 5: AGENTS.md**

Under Global tier examples / jobs, add that item-market sales history is filled by `item-market-tx-backfill` + `item-market-tx-poll` (`transaction.getPaginatedTransactions`).

- [ ] **Step 6: Run focused tests + check**

```bash
vp test src/warera/transactions.test.ts src/db/item-market-transactions.test.ts src/jobs/item-market-tx/ingest.test.ts src/jobs/item-market-tx-poll/run.test.ts src/jobs/runner.test.ts
vp check
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/jobs/item-market-tx-backfill src/jobs/item-market-tx-poll src/jobs/registry.ts AGENTS.md
git commit -m "feat(jobs): item-market-tx backfill and poll"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `item_market_transactions` typed + skills JSON | 1, 4 |
| `jobs.max_runs` + Croner maxRuns | 1, 2 |
| Protect callback records failed overrun | 2 |
| Await cron so protect works | 2 |
| WarEra `getPaginatedTransactions` itemMarket | 3 |
| Insert-ignore by id | 4 |
| Shared walk, 24h backfill, known-id stop | 5 |
| In-process handoff after first backfill page | 5, 6 |
| Poll waits without API until handoff | 6 |
| Dual jobs registered | 6 |
| No UI | all |
| No handoff on backfill failure | 5 (only enable after successful page) |
| Overrun must not flip `last_status` off `running` | 2 (explicit; corrects unsafe literal reading of spec) |

## Placeholder / consistency notes

- `fetchPage` DI on walk avoids brittle module mocks.
- `perPage` default 50 — adjust if live API uses a different param name; confirm against live/gateway during Task 3 if tests with real shapes differ (`limit` vs `perPage`). If the live API rejects `perPage`, switch the input key in Task 3 and note it in the WarEra helper comment.
