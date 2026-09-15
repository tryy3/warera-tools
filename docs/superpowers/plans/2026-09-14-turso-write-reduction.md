# Turso Write Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Turso write/read waste by fixing `job_runs` prune, TTL+batching `region-sync`, and delta-only donation/profile snapshots with an in-process fingerprint cache warmed from Turso.

**Architecture:** Process-memory `Map` fingerprints (lazy warm from latest Turso snapshots); prune via cutoff `(started_at, id)` instead of `NOT IN`; region sync only refreshes rows older than 12h and upserts in batches. Poll parent rows always insert; snapshot rows only on change. Cadences unchanged.

**Tech Stack:** Drizzle ORM + libSQL/Turso, Vitest via `vp test`, Croner jobs under `src/jobs/`.

## Global Constraints

- Do not change job cron expressions (`donation-poll`, `mu-member-poll`, `region-sync`, `item-market-tx-*`).
- Do not touch item-market transaction ingest volume.
- Profile “changed” = any stored content field differs (exclude `pollId` / `recordedAt`).
- Donation “changed” = `amount` differs for `(scope_type, scope_id, user_id)`.
- Always insert `*_polls` even when 0 snapshot deltas.
- Region TTL = **12 hours**; always bump `fetched_at` on successful fetch.
- Prefer `vp test path/to/file.test.ts` for focused runs; `vp check` before claiming done.

## File map

| File | Responsibility |
| --- | --- |
| `src/db/schema.ts` | Add `job_runs (job_id, started_at, id)` index |
| `drizzle/0014_*.sql` (+ meta) | Migration for that index |
| `src/jobs/prune.ts` | Cutoff prune; skip when ≤ keep |
| `src/jobs/prune.test.ts` | Prune behavior tests |
| `src/db/regions.ts` | TTL list helper; batch upsert; export `REGION_SYNC_MAX_AGE_MS` |
| `src/db/regions.test.ts` | TTL + batch tests |
| `src/jobs/region-sync/run.ts` | Use TTL list + batch flush |
| `src/jobs/region-sync/run.test.ts` | Skip fresh; sync stale |
| `src/jobs/snapshot-fingerprint-cache.ts` | Generic in-memory fingerprint cache |
| `src/jobs/snapshot-fingerprint-cache.test.ts` | ensureWarmed / set / clear |
| `src/db/donations.ts` | Latest-amount warm loader + amount fingerprint helpers |
| `src/jobs/donation-poll/run.ts` | Delta filter via cache |
| `src/jobs/donation-poll/run.test.ts` | Identical second poll; amount change; warm skip |
| `src/db/user-profiles.ts` | Latest-profile warm loader + content fingerprint |
| `src/jobs/mu-member-poll/run.ts` | Delta filter via cache |
| `src/jobs/mu-member-poll/run.test.ts` | Identical second poll; field change; warm skip |
| `docs/warera-api/inventory.md` | Sparse snapshot wording |

---

### Task 1: Fix `job_runs` prune + index

**Files:**
- Modify: `src/db/schema.ts` (`jobRuns` table)
- Create: `drizzle/0014_*.sql` via `vp run db:generate` (or hand-write matching repo style)
- Modify: `src/jobs/prune.ts`
- Create: `src/jobs/prune.test.ts`

**Interfaces:**
- Consumes: existing `Db`, `jobRuns`
- Produces: `pruneJobRuns(db, jobId, keep)` with cutoff delete semantics (no `notInArray`)

- [ ] **Step 1: Write failing prune tests**

Create `src/jobs/prune.test.ts`:

```ts
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { pruneJobRuns } from "./prune";

async function createDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      enabled INTEGER DEFAULT 1 NOT NULL,
      cron TEXT NOT NULL,
      max_runs INTEGER,
      last_started_at INTEGER,
      last_finished_at INTEGER,
      last_status TEXT,
      last_error TEXT,
      state TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER
    )
  `);
  return drizzle(client, { schema });
}

describe("pruneJobRuns", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
    await db.insert(schema.jobs).values({
      id: "j1",
      name: "J1",
      cron: "0 * * * * *",
    });
  });

  it("no-ops when row count is under keep", async () => {
    const t0 = new Date("2026-09-01T00:00:00.000Z");
    await db.insert(schema.jobRuns).values([
      { jobId: "j1", startedAt: t0, status: "success" },
      { jobId: "j1", startedAt: new Date(t0.getTime() + 1000), status: "success" },
    ]);
    await pruneJobRuns(db, "j1", 50);
    expect(await db.select().from(schema.jobRuns).where(eq(schema.jobRuns.jobId, "j1"))).toHaveLength(
      2,
    );
  });

  it("keeps the newest keep rows and deletes older ones", async () => {
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.jobRuns).values({
        jobId: "j1",
        startedAt: new Date(base + i * 1000),
        status: "success",
      });
    }
    await pruneJobRuns(db, "j1", 2);
    const remaining = await db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.jobId, "j1"));
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.startedAt.getTime()).sort()).toEqual([
      base + 3000,
      base + 4000,
    ]);
  });

  it("deletes all rows when keep is 0", async () => {
    await db.insert(schema.jobRuns).values({
      jobId: "j1",
      startedAt: new Date(),
      status: "success",
    });
    await pruneJobRuns(db, "j1", 0);
    expect(await db.select().from(schema.jobRuns)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect fail on wrong delete semantics or pass after implement**

Run: `vp test src/jobs/prune.test.ts`

Expected: FAIL until prune is rewritten (or FAIL on import if file empty).

- [ ] **Step 3: Implement cutoff prune**

Replace `src/jobs/prune.ts` with:

```ts
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobRuns } from "../db/schema";

export async function pruneJobRuns(db: Db, jobId: string, keep: number): Promise<void> {
  if (keep < 0) {
    throw new Error("keep must be >= 0");
  }

  if (keep === 0) {
    await db.delete(jobRuns).where(eq(jobRuns.jobId, jobId));
    return;
  }

  const keepRows = await db
    .select({ id: jobRuns.id, startedAt: jobRuns.startedAt })
    .from(jobRuns)
    .where(eq(jobRuns.jobId, jobId))
    .orderBy(desc(jobRuns.startedAt), desc(jobRuns.id))
    .limit(keep);

  if (keepRows.length < keep) {
    return;
  }

  const cutoff = keepRows[keepRows.length - 1]!;
  const cutoffStartedAt = cutoff.startedAt as Date;

  await db
    .delete(jobRuns)
    .where(
      and(
        eq(jobRuns.jobId, jobId),
        or(
          lt(jobRuns.startedAt, cutoffStartedAt),
          and(eq(jobRuns.startedAt, cutoffStartedAt), lt(jobRuns.id, cutoff.id)),
        ),
      ),
    );
}
```

Remove unused `sql` import if the linter complains — do not import `sql` if unused.

- [ ] **Step 4: Add schema index**

Change `jobRuns` in `src/db/schema.ts` to:

```ts
export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    status: text("status").notNull(),
    message: text("message"),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("job_runs_job_id_started_at_id_idx").on(t.jobId, t.startedAt, t.id)],
);
```

Ensure `index` is already imported from `drizzle-orm/sqlite-core`.

- [ ] **Step 5: Generate migration**

Run: `vp run db:generate`

Expected: new `drizzle/0014_*.sql` containing  
`CREATE INDEX \`job_runs_job_id_started_at_id_idx\` ON \`job_runs\` (\`job_id\`,\`started_at\`,\`id\`);`

- [ ] **Step 6: Re-run prune tests**

Run: `vp test src/jobs/prune.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/jobs/prune.ts src/jobs/prune.test.ts src/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
fix: prune job_runs by cutoff instead of NOT IN

EOF
)"
```

---

### Task 2: Region sync TTL + batch upserts

**Files:**
- Modify: `src/db/regions.ts`
- Modify: `src/db/regions.test.ts`
- Modify: `src/jobs/region-sync/run.ts`
- Modify: `src/jobs/region-sync/run.test.ts`

**Interfaces:**
- Consumes: existing `upsertRegionFetched`, `listRegionsForSync`
- Produces:
  - `REGION_SYNC_MAX_AGE_MS = 12 * 60 * 60 * 1000`
  - `listRegionsForSync(db, opts?: { now?: Date; maxAgeMs?: number })`
  - `upsertRegionsFetched(db, rows: Array<{...}>)` batch (chunk size 100)

- [ ] **Step 1: Extend regions tests (TTL + batch)**

Add to `src/db/regions.test.ts`:

```ts
import { REGION_SYNC_MAX_AGE_MS, upsertRegionsFetched } from "./regions";

it("listRegionsForSync skips rows fresher than maxAgeMs", async () => {
  const now = new Date("2026-09-14T12:00:00.000Z");
  await upsertRegionFetched(db, {
    id: "fresh",
    name: "Fresh",
    countryCode: "SE",
    fetchedAt: new Date(now.getTime() - 60_000),
  });
  await upsertRegionFetched(db, {
    id: "stale",
    name: "Stale",
    countryCode: "NO",
    fetchedAt: new Date(now.getTime() - REGION_SYNC_MAX_AGE_MS - 1),
  });
  await enqueueRegion(db, "pending", now);
  const ids = (await listRegionsForSync(db, { now, maxAgeMs: REGION_SYNC_MAX_AGE_MS })).map(
    (r) => r.id,
  );
  expect(ids).toEqual(["pending", "stale"]);
});

it("upsertRegionsFetched writes many rows in one call", async () => {
  const fetchedAt = new Date("2026-09-14T12:00:00.000Z");
  await upsertRegionsFetched(db, [
    { id: "a", name: "A", countryCode: "SE", fetchedAt },
    { id: "b", name: "B", countryCode: "NO", fetchedAt },
  ]);
  expect((await getRegion(db, "a"))?.name).toBe("A");
  expect((await getRegion(db, "b"))?.countryCode).toBe("NO");
});
```

Update the existing ordering test to pass `{ now: new Date("2026-08-01T12:00:00.000Z"), maxAgeMs: Number.POSITIVE_INFINITY }` (or a very large maxAge) so all rows remain candidates and order assertions stay valid.

- [ ] **Step 2: Run regions tests — expect FAIL**

Run: `vp test src/db/regions.test.ts`  
Expected: FAIL (exports / TTL filter missing)

- [ ] **Step 3: Implement TTL list + batch upsert**

In `src/db/regions.ts`:

```ts
export const REGION_SYNC_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const REGION_UPSERT_CHUNK = 100;

export async function listRegionsForSync(
  db: Db,
  opts?: { now?: Date; maxAgeMs?: number },
): Promise<RegionRow[]> {
  const now = opts?.now ?? new Date();
  const maxAgeMs = opts?.maxAgeMs ?? REGION_SYNC_MAX_AGE_MS;
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const rows = await db.select().from(regions);
  return rows
    .map(mapRow)
    .filter((r) => r.fetchedAt == null || r.fetchedAt.getTime() <= cutoff.getTime())
    .toSorted((a, b) => {
      if (a.fetchedAt == null && b.fetchedAt != null) return -1;
      if (a.fetchedAt != null && b.fetchedAt == null) return 1;
      if (a.fetchedAt == null && b.fetchedAt == null) {
        return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
      }
      return a.fetchedAt!.getTime() - b.fetchedAt!.getTime();
    });
}

export async function upsertRegionsFetched(
  db: Db,
  rows: Array<{
    id: string;
    name: string | null;
    countryCode: string | null;
    payload?: Record<string, unknown> | null;
    fetchedAt: Date;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += REGION_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + REGION_UPSERT_CHUNK);
    await db
      .insert(regions)
      .values(
        chunk.map((row) => ({
          id: row.id,
          name: row.name,
          countryCode: row.countryCode,
          payload: row.payload ?? null,
          fetchedAt: row.fetchedAt,
          enqueuedAt: row.fetchedAt,
        })),
      )
      .onConflictDoUpdate({
        target: regions.id,
        set: {
          name: sql`excluded.name`,
          countryCode: sql`excluded.country_code`,
          payload: sql`excluded.payload`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }
}
```

Keep single-row `upsertRegionFetched` as a thin wrapper calling `upsertRegionsFetched(db, [row])`.

Import `sql` from `drizzle-orm` for the `excluded.*` references (required for multi-row conflict updates).

- [ ] **Step 4: Update region-sync job**

In `src/jobs/region-sync/run.ts`, buffer successful fetches and flush with `upsertRegionsFetched`:

```ts
import { listRegionsForSync, upsertRegionsFetched } from "../../db/regions";

// inside runRegionSync:
const list = await listRegionsForSync(db, { now });
const pending: Array<{ id: string; name: string | null; countryCode: string | null; fetchedAt: Date }> = [];

for (const row of list) {
  try {
    const info = await fetchRegionInfoOrThrow(warera, row.id);
    pending.push({
      id: row.id,
      name: info.name,
      countryCode: info.countryCode,
      fetchedAt: now,
    });
    regionCount += 1;
  } catch (err) {
    errors += 1;
    logger.warn(/* existing */);
  }
}
await upsertRegionsFetched(db, pending);
```

- [ ] **Step 5: Add region-sync run test for skipping fresh**

In `src/jobs/region-sync/run.test.ts`, after syncing `r1` once, call `runRegionSync` again with the same warera mock and `now` advanced by 1 minute only — expect `request` not called again and `regionCount: 0`. Inject clock by passing `now` into `runRegionSync` if needed:

```ts
// extend options:
now?: Date;

// call site:
const list = await listRegionsForSync(db, { now: options.now ?? new Date() });
```

- [ ] **Step 6: Run tests**

Run: `vp test src/db/regions.test.ts src/jobs/region-sync/run.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/regions.ts src/db/regions.test.ts src/jobs/region-sync/
git commit -m "$(cat <<'EOF'
fix: TTL-filter and batch region-sync upserts

EOF
)"
```

---

### Task 3: Snapshot fingerprint cache helper

**Files:**
- Create: `src/jobs/snapshot-fingerprint-cache.ts`
- Create: `src/jobs/snapshot-fingerprint-cache.test.ts`

**Interfaces:**
- Produces:

```ts
export type FingerprintCache = {
  get(key: string): string | undefined;
  set(key: string, fingerprint: string): void;
  setMany(entries: Iterable<readonly [string, string]>): void;
  ensureWarmed(
    keys: readonly string[],
    loader: (missingKeys: string[]) => Promise<Map<string, string>>,
  ): Promise<void>;
  clear(): void;
};

export function createFingerprintCache(): FingerprintCache;
```

- [ ] **Step 1: Write failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createFingerprintCache } from "./snapshot-fingerprint-cache";

describe("createFingerprintCache", () => {
  let cache: ReturnType<typeof createFingerprintCache>;
  beforeEach(() => {
    cache = createFingerprintCache();
  });

  it("ensureWarmed loads only missing keys once", async () => {
    const loader = vi.fn(async (missing: string[]) => {
      expect(missing).toEqual(["a", "b"]);
      return new Map([
        ["a", "1"],
        ["b", "2"],
      ]);
    });
    await cache.ensureWarmed(["a", "b", "a"], loader);
    expect(loader).toHaveBeenCalledOnce();
    expect(cache.get("a")).toBe("1");
    await cache.ensureWarmed(["a", "b"], loader);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("set updates fingerprints used for later compares", () => {
    cache.set("u1", "fp-old");
    cache.set("u1", "fp-new");
    expect(cache.get("u1")).toBe("fp-new");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/jobs/snapshot-fingerprint-cache.test.ts`

- [ ] **Step 3: Implement**

```ts
export type FingerprintCache = {
  get(key: string): string | undefined;
  set(key: string, fingerprint: string): void;
  setMany(entries: Iterable<readonly [string, string]>): void;
  ensureWarmed(
    keys: readonly string[],
    loader: (missingKeys: string[]) => Promise<Map<string, string>>,
  ): Promise<void>;
  clear(): void;
};

export function createFingerprintCache(): FingerprintCache {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key),
    set: (key, fingerprint) => {
      map.set(key, fingerprint);
    },
    setMany: (entries) => {
      for (const [key, fingerprint] of entries) map.set(key, fingerprint);
    },
    async ensureWarmed(keys, loader) {
      const missing = [...new Set(keys.filter((k) => k.length > 0 && !map.has(k)))];
      if (missing.length === 0) return;
      const loaded = await loader(missing);
      for (const [key, fingerprint] of loaded) map.set(key, fingerprint);
      // Keys with no DB row stay absent → first write treats them as new (insert).
    },
    clear: () => map.clear(),
  };
}
```

Note: keys that warm-miss (no DB row) must **not** be inserted as empty fingerprints. Absence ⇒ treat as changed/new on first compare (`cache.get(key) !== fingerprint`).

- [ ] **Step 4: Run — expect PASS**

Run: `vp test src/jobs/snapshot-fingerprint-cache.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/jobs/snapshot-fingerprint-cache.ts src/jobs/snapshot-fingerprint-cache.test.ts
git commit -m "$(cat <<'EOF'
feat: add in-process snapshot fingerprint cache

EOF
)"
```

---

### Task 4: Donation delta writes

**Files:**
- Modify: `src/db/donations.ts`
- Modify: `src/jobs/donation-poll/run.ts`
- Modify: `src/jobs/donation-poll/run.test.ts`

**Interfaces:**
- Consumes: `createFingerprintCache`, `DonationSnapshotRow`
- Produces:
  - `donationAmountFingerprint(amount: number | null): string`
  - `donationFingerprintKey(scopeType, scopeId, userId): string`
  - `loadLatestDonationAmountFingerprints(db, keys: string[]): Promise<Map<string, string>>`
  - Module singleton `donationFingerprintCache` (export `clear` via `.clear()` for tests)

- [ ] **Step 1: Add failing delta tests to donation-poll**

In `beforeEach`, call `donationFingerprintCache.clear()`.

```ts
it("second identical poll writes poll row but zero new snapshots", async () => {
  await seedMuReason(db);
  const warera = {
    request: vi
      .fn()
      .mockResolvedValue({
        result: { data: { items: [donation("mu")], nextCursor: null } },
      }),
  };
  // First poll: Sweden + MU → mock must return country then mu (or match call order)
  // Prefer dedicated fixtures that only watch MU to simplify: seed MU only and
  // mock both scopes, or assert total snapshot growth.

  await runDonationPoll({ db, warera: warera as never, logger: makeLogger() as never });
  const afterFirst = (await db.select().from(schema.donationSnapshots)).length;

  await runDonationPoll({ db, warera: warera as never, logger: makeLogger() as never });
  const polls = await db.select().from(schema.donationPolls);
  const snapshots = await db.select().from(schema.donationSnapshots);
  expect(polls.length).toBe(2);
  expect(snapshots.length).toBe(afterFirst);
  expect(polls[1]?.rowCount).toBe(0);
});

it("writes a snapshot when amount changes", async () => {
  // poll with amount 100, then amount 150 → +1 snapshot for that donor
});

it("warms from DB and skips rewrite after cache clear", async () => {
  // first poll writes; clear memory cache; second identical poll → still 0 new snapshots
});
```

Wire mocks carefully so both polls hit the same scopes/amounts. Reuse the existing Sweden+MU fixture pattern; `mockResolvedValue` (not Once) so both polls get the same responses.

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/jobs/donation-poll/run.test.ts`

- [ ] **Step 3: Add DB helpers in `src/db/donations.ts`**

```ts
export function donationFingerprintKey(
  scopeType: string,
  scopeId: string,
  userId: string,
): string {
  return `${scopeType}:${scopeId}:${userId}`;
}

export function donationAmountFingerprint(amount: number | null): string {
  return amount == null ? "null" : String(amount);
}

/** keys are `${scopeType}:${scopeId}:${userId}` */
export async function loadLatestDonationAmountFingerprints(
  db: Db,
  keys: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (keys.length === 0) return out;

  // Parse keys → triples; query latest per triple.
  // Implementation: for each unique scope, select snapshots and pick max(poll_id)
  // in JS, OR one SQL window query via db.all(sql`...`).
  // Prefer a single raw SQL for the key set:

  const triples = keys.map((key) => {
    const [scopeType, scopeId, userId] = key.split(":");
    return { scopeType: scopeType!, scopeId: scopeId!, userId: userId! };
  });

  // Simple correct approach for v1 (watch sets are small):
  for (const { scopeType, scopeId, userId } of triples) {
    const rows = await db
      .select({
        amount: donationSnapshots.amount,
        pollId: donationSnapshots.pollId,
      })
      .from(donationSnapshots)
      .where(
        and(
          eq(donationSnapshots.scopeType, scopeType),
          eq(donationSnapshots.scopeId, scopeId),
          eq(donationSnapshots.userId, userId),
        ),
      )
      .orderBy(desc(donationSnapshots.pollId))
      .limit(1);
    const row = rows[0];
    if (row) {
      out.set(
        donationFingerprintKey(scopeType, scopeId, userId),
        donationAmountFingerprint(row.amount),
      );
    }
  }
  return out;
}
```

If N keys grows large later, replace the loop with one windowed SQL; for current watchlists the loop is fine. Optionally batch with `inArray` on concatenated keys stored in SQL — not required for this task.

- [ ] **Step 4: Wire donation-poll**

In `src/jobs/donation-poll/run.ts` (conceptually):

```ts
import { createFingerprintCache } from "../snapshot-fingerprint-cache";
import {
  donationAmountFingerprint,
  donationFingerprintKey,
  loadLatestDonationAmountFingerprints,
  // ...
} from "../../db/donations";

export const donationFingerprintCache = createFingerprintCache();

// after building `rows`:
const keys = rows.map((r) => donationFingerprintKey(r.scopeType, r.scopeId, r.userId));
await donationFingerprintCache.ensureWarmed(keys, (missing) =>
  loadLatestDonationAmountFingerprints(db, missing),
);

const deltas = rows.filter((r) => {
  const key = donationFingerprintKey(r.scopeType, r.scopeId, r.userId);
  const fp = donationAmountFingerprint(r.amount);
  return donationFingerprintCache.get(key) !== fp;
});

const pollId = await insertDonationPoll(db, {
  // ...
  rowCount: deltas.length,
});
await insertDonationSnapshots(db, pollId, deltas);
donationFingerprintCache.setMany(
  deltas.map((r) => [
    donationFingerprintKey(r.scopeType, r.scopeId, r.userId),
    donationAmountFingerprint(r.amount),
  ]),
);
```

Return `rowCount: deltas.length`.

- [ ] **Step 5: Run donation tests — PASS**

Run: `vp test src/jobs/donation-poll/run.test.ts src/db/donations.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/db/donations.ts src/jobs/donation-poll/
git commit -m "$(cat <<'EOF'
feat: write donation snapshots only when amount changes

EOF
)"
```

---

### Task 5: Profile delta writes

**Files:**
- Modify: `src/db/user-profiles.ts`
- Modify: `src/jobs/mu-member-poll/run.ts`
- Modify: `src/jobs/mu-member-poll/run.test.ts`

**Interfaces:**
- Consumes: `createFingerprintCache`, `UserProfileSnapshotRow`
- Produces:
  - `userProfileContentFingerprint(row: Omit<UserProfileSnapshotRow, "recordedAt"> | UserProfileSnapshotRow): string`
  - `loadLatestUserProfileFingerprints(db, userIds: string[]): Promise<Map<string, string>>`
  - `userProfileFingerprintCache` singleton

- [ ] **Step 1: Add failing mu-member-poll delta tests**

Clear cache in `beforeEach`.

```ts
it("second identical poll writes poll row but zero new snapshots", async () => {
  await seedWatchedMu(db, "mu-1", ["u1"]);
  const requestBatch = vi.fn(async () => [{ ok: true as const, data: profileFixture("u1") }]);
  await runMuMemberPoll({ db, warera: { request: vi.fn(), requestBatch } as never, logger: makeLogger() as never, now: NOW });
  await runMuMemberPoll({
    db,
    warera: { request: vi.fn(), requestBatch } as never,
    logger: makeLogger() as never,
    now: new Date(NOW.getTime() + 5 * 60_000),
  });
  expect(await db.select().from(schema.userProfileSnapshots)).toHaveLength(1);
  const polls = await db.select().from(schema.userProfilePolls);
  expect(polls).toHaveLength(2);
  expect(polls[1]?.userCount).toBe(0);
});

it("writes when a stored field changes", async () => {
  // second fixture with totalXp + 1 → snapshots length 2
});

it("after cache.clear(), warms from DB and skips identical rewrite", async () => {
  // poll; clear; poll identical → still 1 snapshot
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/jobs/mu-member-poll/run.test.ts`

- [ ] **Step 3: Fingerprint + warm helpers in `user-profiles.ts`**

```ts
function dateFp(d: Date | null): string {
  return d == null ? "null" : String(d.getTime());
}

export function userProfileContentFingerprint(row: UserProfileSnapshotRow): string {
  // Stable field order; exclude recordedAt
  return [
    row.userId,
    row.username,
    row.avatarUrl,
    row.countryId,
    row.muId,
    row.companyId,
    row.partyId,
    String(row.isActive),
    dateFp(row.lastConnectionAt),
    dateFp(row.lastWorkAt),
    dateFp(row.lastHelpAskedAt),
    dateFp(row.lastDailyRewardClaimedAt),
    dateFp(row.lastCompanyJoinedAt),
    dateFp(row.lastDailyCalendarClaimedAt),
    dateFp(row.lastSkillsResetAt),
    String(row.level),
    String(row.totalXp),
    String(row.dailyXpLeft),
    String(row.availableSkillPoints),
    String(row.spentSkillPoints),
    String(row.totalSkillPoints),
    String(row.prestigeLevel),
    String(row.militaryRank),
    String(row.isPremium),
    String(row.premiumMonthsCount),
    dateFp(row.createdAtGame),
  ].join("|");
}

export async function loadLatestUserProfileFingerprints(
  db: Db,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  for (const userId of unique) {
    const latest = await getLatestUserProfile(db, userId);
    if (latest) out.set(userId, userProfileContentFingerprint(latest));
  }
  return out;
}
```

- [ ] **Step 4: Wire `mu-member-poll/run.ts`**

Same pattern as donations: warm → filter deltas → insert poll with `userCount: deltas.length` → insert snapshots → `setMany`.

Export `userProfileFingerprintCache` from the job module (or from `user-profiles.ts`); clear it in tests.

- [ ] **Step 5: Run tests**

Run: `vp test src/jobs/mu-member-poll/run.test.ts src/db/user-profiles.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/db/user-profiles.ts src/jobs/mu-member-poll/
git commit -m "$(cat <<'EOF'
feat: write user profile snapshots only when content changes

EOF
)"
```

---

### Task 6: Inventory doc + final check

**Files:**
- Modify: `docs/warera-api/inventory.md`

- [ ] **Step 1: Update storage wording**

In the Geo table rows for MU member profiles and Donations, change Storage cells to note sparse append-on-change, e.g.:

- Profiles: `Append-on-change \`user_profile_polls\` / \`user_profile_snapshots\` (poll row every run; snapshot only when content changes)`
- Donations: `Append-on-change \`donation_polls\` / \`donation_snapshots\` (poll row every run; snapshot only when amount changes)`

Also note region-sync: `Latest rows (\`regions\`); refresh when fetched_at null or older than 12h`.

- [ ] **Step 2: Run full verification**

Run: `vp check && vp test src/jobs/prune.test.ts src/db/regions.test.ts src/jobs/region-sync/run.test.ts src/jobs/snapshot-fingerprint-cache.test.ts src/jobs/donation-poll/run.test.ts src/jobs/mu-member-poll/run.test.ts`

Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add docs/warera-api/inventory.md
git commit -m "$(cat <<'EOF'
docs: note sparse donation/profile snapshots and region TTL

EOF
)"
```

---

## Spec coverage self-check

| Spec requirement | Task |
| --- | --- |
| Cutoff prune, no NOT IN | Task 1 |
| Index on job_runs | Task 1 |
| Region 12h TTL | Task 2 |
| Batch region upserts | Task 2 |
| Bump fetched_at on fetch | Task 2 |
| Memory fingerprints + Turso warm | Tasks 3–5 |
| Profile all content fields | Task 5 |
| Donation amount fingerprint | Task 4 |
| Always write poll parents | Tasks 4–5 |
| Inventory update | Task 6 |
| Market TX / cadence untouched | Global constraints |

## Placeholder scan

No TBD/TODO left in task steps; warm SQL may start as per-key latest queries (explicitly allowed) and stay correct.
