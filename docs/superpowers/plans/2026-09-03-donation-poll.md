# Donation Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hourly job that drains `donation.getManyPaginated` for watched MUs and watched countries, appending per-donor running-total snapshots (no UI / read routes).

**Architecture:** Reuse `mu_watch_reasons` for MU scopes. Add `country_watch_reasons` (seed Sweden `manual`). New `donation-poll` job builds `(scope_type, scope_id)` pairs, drains pages at `limit: 100`, writes `donation_polls` + `donation_snapshots` (`scope_type` + `scope_id` discriminator). Party is reserved in the type union but never polled.

**Tech Stack:** TypeScript, Drizzle/Turso, Croner, Vitest via `vp test`, Vite+ (`vp check`, `vp run db:generate` / `pnpm db:generate`).

**Design:** [2026-09-03-donation-poll-design.md](../specs/2026-09-03-donation-poll-design.md)

## Global Constraints

- No UI, Hono read routes, or weekly-diff helpers in this slice
- `donation.getManyPaginated` is an api2 OpenAPI override (same class as `muMember.getByMu`)
- Prefer GET; fall back to POST + `authStyle: "api-key"` when GET is rejected
- Page `limit: 100`; follow `nextCursor` until exhausted — full drain every poll
- Each API row is a per-donor **running total**, not an event delta
- `scope_type`: `mu` | `country` written; `party` reserved / skipped if seen
- Country seed: WarEra Sweden id `6813b6d446e731854c7ac7f2`, reason `manual`, source `""`
- Any country watch reason ⇒ include in donation poll
- Prefer `vp test path/to/file.test.ts` while iterating; `vp check` before considering a task done
- Commit after each task
- Update `docs/warera-api/inventory.md` in this work; do not update `vision.md`

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | `countryWatchReasons`, `donationPolls`, `donationSnapshots` |
| `drizzle/0011_*.sql` (+ meta) | Tables + seed Sweden `manual` reason |
| `src/db/watch-reasons.ts` (+ test) | Country reason CRUD + `listDistinctWatchedCountryIds` + `ensureSwedenCountryWatchReason` |
| `src/db/donations.ts` (+ test) | `insertDonationPoll` / `insertDonationSnapshots` |
| `src/warera/donations.ts` (+ test) | Parse page + drain `donation.getManyPaginated` |
| `src/jobs/donation-poll/` | Hourly job definition + `runDonationPoll` |
| `src/jobs/registry.ts` | Register job |
| `.agents/skills/warera-api/SKILL.md` | Allowlist note for `donation.getManyPaginated` |
| `docs/warera-api/inventory.md` | Geo donation + country watchlist rows |
| `AGENTS.md` | One-line Geo note if MU/country watchlist table mentions donations |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0011_*.sql` + `drizzle/meta/*` via generate, then hand-edit SQL for Sweden seed

**Interfaces:**
- Consumes: existing drizzle sqlite patterns (`primaryKey`, `index`, `integer`, `real`, `sqliteTable`, `text`)
- Produces: tables `country_watch_reasons`, `donation_polls`, `donation_snapshots`

- [ ] **Step 1: Append tables to `src/db/schema.ts` (after `muWatchReasons`)**

```ts
export const countryWatchReasons = sqliteTable(
  "country_watch_reasons",
  {
    countryId: text("country_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.countryId, t.reason, t.sourceId] })],
);

export const donationPolls = sqliteTable(
  "donation_polls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    error: text("error"),
    scopeCount: integer("scope_count").notNull().default(0),
    rowCount: integer("row_count").notNull().default(0),
  },
  (t) => [index("donation_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const donationSnapshots = sqliteTable(
  "donation_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => donationPolls.id),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    userId: text("user_id").notNull(),
    donationRowId: text("donation_row_id"),
    amount: real("amount"),
    donationCreatedAt: integer("donation_created_at", { mode: "timestamp_ms" }),
    donationUpdatedAt: integer("donation_updated_at", { mode: "timestamp_ms" }),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (t) => [
    index("donation_snapshots_scope_user_poll_idx").on(
      t.scopeType,
      t.scopeId,
      t.userId,
      t.pollId,
    ),
  ],
);
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`  
Expected: new `drizzle/0011_*.sql` (+ meta journal/snapshot). If generate names differently, keep whatever file drizzle creates as the next migration after `0010`.

- [ ] **Step 3: Append Sweden seed to the generated SQL**

At the end of the new migration SQL (after the CREATE/INDEX statements), add:

```sql
--> statement-breakpoint
INSERT OR IGNORE INTO `country_watch_reasons` (`country_id`, `reason`, `source_id`, `last_touched_at`, `created_at`)
VALUES ('6813b6d446e731854c7ac7f2', 'manual', '', (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000));
```

Do **not** invent a second seed path that conflicts with this; job startup will also upsert for empty/dev DBs that already migrated without re-running SQL.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(db): add country watch reasons and donation snapshot tables

EOF
)"
```

---

### Task 2: Country watch-reason helpers

**Files:**
- Modify: `src/db/watch-reasons.ts`
- Modify: `src/db/watch-reasons.test.ts`

**Interfaces:**
- Consumes: `countryWatchReasons` from schema; `WATCH_REASON_MANUAL`, `MANUAL_SOURCE_ID`
- Produces:
  - `SEED_COUNTRY_SWEDEN_ID = "6813b6d446e731854c7ac7f2"`
  - `insertCountryWatchReason(db, { countryId, reason, sourceId, at })`
  - `deleteCountryWatchReason(db, { countryId, reason, sourceId })`
  - `listDistinctWatchedCountryIds(db): Promise<string[]>`
  - `ensureSwedenCountryWatchReason(db, at: Date): Promise<void>`

- [ ] **Step 1: Extend the in-memory DDL in `watch-reasons.test.ts`**

Inside `createDb()`, after the MU table create, add:

```ts
  await client.execute(`
    CREATE TABLE country_watch_reasons (
      country_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_id TEXT NOT NULL,
      last_touched_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (country_id, reason, source_id)
    )
  `);
```

Import the new helpers and `countryWatchReasons` as needed.

- [ ] **Step 2: Write failing tests**

Add cases:

```ts
  it("lists distinct watched country ids sorted by id", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    await insertCountryWatchReason(db, {
      countryId: "cB",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertCountryWatchReason(db, {
      countryId: "cA",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertCountryWatchReason(db, {
      countryId: "cA",
      reason: "mu_home",
      sourceId: "mu1",
      at,
    });
    expect(await listDistinctWatchedCountryIds(db)).toEqual(["cA", "cB"]);
  });

  it("country duplicate insert is idempotent", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    const row = {
      countryId: "c1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    };
    await insertCountryWatchReason(db, row);
    await insertCountryWatchReason(db, row);
    const rows = await db.select().from(countryWatchReasons);
    expect(rows).toHaveLength(1);
  });

  it("ensureSwedenCountryWatchReason inserts seed once", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    await ensureSwedenCountryWatchReason(db, at);
    await ensureSwedenCountryWatchReason(db, at);
    expect(await listDistinctWatchedCountryIds(db)).toEqual([SEED_COUNTRY_SWEDEN_ID]);
  });

  it("deleteCountryWatchReason removes only the matching row", async () => {
    const at = new Date("2026-09-03T00:00:00.000Z");
    await insertCountryWatchReason(db, {
      countryId: "c1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
      at,
    });
    await insertCountryWatchReason(db, {
      countryId: "c1",
      reason: "mu_home",
      sourceId: "mu1",
      at,
    });
    await deleteCountryWatchReason(db, {
      countryId: "c1",
      reason: WATCH_REASON_MANUAL,
      sourceId: MANUAL_SOURCE_ID,
    });
    expect(await listDistinctWatchedCountryIds(db)).toEqual(["c1"]);
    const left = await db.select().from(countryWatchReasons);
    expect(left).toHaveLength(1);
    expect(left[0]?.reason).toBe("mu_home");
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `vp test src/db/watch-reasons.test.ts`  
Expected: FAIL (helpers / exports missing)

- [ ] **Step 4: Implement helpers in `watch-reasons.ts`**

```ts
import { countryWatchReasons } from "./schema";

export const SEED_COUNTRY_SWEDEN_ID = "6813b6d446e731854c7ac7f2";

export async function insertCountryWatchReason(
  db: DbOrTx,
  row: { countryId: string; reason: string; sourceId: string; at: Date },
): Promise<void> {
  await db
    .insert(countryWatchReasons)
    .values({
      countryId: row.countryId,
      reason: row.reason,
      sourceId: row.sourceId,
      lastTouchedAt: row.at,
      createdAt: row.at,
    })
    .onConflictDoNothing();
}

export async function deleteCountryWatchReason(
  db: Db,
  row: { countryId: string; reason: string; sourceId: string },
): Promise<void> {
  await db
    .delete(countryWatchReasons)
    .where(
      and(
        eq(countryWatchReasons.countryId, row.countryId),
        eq(countryWatchReasons.reason, row.reason),
        eq(countryWatchReasons.sourceId, row.sourceId),
      ),
    );
}

export async function listDistinctWatchedCountryIds(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ countryId: countryWatchReasons.countryId })
    .from(countryWatchReasons)
    .orderBy(asc(countryWatchReasons.countryId));
  return rows.map((r) => r.countryId);
}

export async function ensureSwedenCountryWatchReason(db: DbOrTx, at: Date): Promise<void> {
  await insertCountryWatchReason(db, {
    countryId: SEED_COUNTRY_SWEDEN_ID,
    reason: WATCH_REASON_MANUAL,
    sourceId: MANUAL_SOURCE_ID,
    at,
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp test src/db/watch-reasons.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/watch-reasons.ts src/db/watch-reasons.test.ts
git commit -m "$(cat <<'EOF'
feat(db): country watch reasons with Sweden seed helper

EOF
)"
```

---

### Task 3: WarEra donations client

**Files:**
- Create: `src/warera/donations.ts`
- Create: `src/warera/donations.test.ts`

**Interfaces:**
- Consumes: `WareraRequester`, `unwrapTrpcData`, `wareraProcedurePath`, `isWareraGetRejectedError`
- Produces:
  - `DonationScopeType = "mu" | "country" | "party"`
  - `ParsedDonation = { donationRowId, scopeType, scopeId, userId, amount, donationCreatedAt, donationUpdatedAt, payload }`
  - `parseDonationPage(data): { items: ParsedDonation[]; nextCursor: string | null }` (skips `party` and unparseable rows)
  - `fetchDonationPage(warera, { scopeType: "mu"|"country", scopeId, cursor?, limit? })`
  - `drainDonations(warera, { scopeType: "mu"|"country", scopeId, limit? }): Promise<ParsedDonation[]>`

- [ ] **Step 1: Write failing parser + drain tests in `donations.test.ts`**

```ts
import { describe, expect, it, vi } from "vite-plus/test";
import { drainDonations, parseDonationPage } from "./donations";

describe("parseDonationPage", () => {
  it("maps muId/countryId to scope and keeps running totals", () => {
    const page = parseDonationPage({
      items: [
        {
          _id: "d1",
          muId: "mu1",
          countryId: null,
          partyId: null,
          userId: "u1",
          amount: 3080,
          createdAt: "2026-04-20T08:27:34.084Z",
          updatedAt: "2026-09-03T06:57:17.251Z",
        },
        {
          _id: "d2",
          muId: null,
          countryId: "c1",
          partyId: null,
          userId: "u2",
          amount: 10,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
        {
          _id: "d3",
          muId: null,
          countryId: null,
          partyId: "p1",
          userId: "u3",
          amount: 1,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      nextCursor: "cursor-2",
    });
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      donationRowId: "d1",
      scopeType: "mu",
      scopeId: "mu1",
      userId: "u1",
      amount: 3080,
    });
    expect(page.items[1]).toMatchObject({
      scopeType: "country",
      scopeId: "c1",
      userId: "u2",
      amount: 10,
    });
  });
});

describe("drainDonations", () => {
  it("follows nextCursor until exhausted", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          data: {
            items: [{ _id: "d1", muId: "mu1", userId: "u1", amount: 1, createdAt: "2026-01-01T00:00:00.000Z" }],
            nextCursor: "c2",
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: {
            items: [{ _id: "d2", muId: "mu1", userId: "u2", amount: 2, createdAt: "2026-01-01T00:00:00.000Z" }],
            nextCursor: null,
          },
        },
      });
    const rows = await drainDonations({ request } as never, {
      scopeType: "mu",
      scopeId: "mu1",
      limit: 100,
    });
    expect(rows.map((r) => r.userId)).toEqual(["u1", "u2"]);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/warera/donations.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/warera/donations.ts`**

Mirror `transactions.ts` parsing helpers and `fetchMuMembersByMu` GET→POST fallback:

```ts
import { isWareraGetRejectedError } from "./errors";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type DonationScopeType = "mu" | "country" | "party";

export type ParsedDonation = {
  donationRowId: string | null;
  scopeType: DonationScopeType;
  scopeId: string;
  userId: string;
  amount: number | null;
  donationCreatedAt: Date | null;
  donationUpdatedAt: Date | null;
  payload: Record<string, unknown> | null;
};

const DONATION_INIT = { authStyle: "api-key" as const };

// asRecord / pickString / pickNumber / pickDate helpers (same style as transactions.ts)

function resolveScope(obj: Record<string, unknown>): {
  scopeType: DonationScopeType;
  scopeId: string;
} | null {
  const muId = typeof obj.muId === "string" && obj.muId ? obj.muId : null;
  const countryId = typeof obj.countryId === "string" && obj.countryId ? obj.countryId : null;
  const partyId = typeof obj.partyId === "string" && obj.partyId ? obj.partyId : null;
  if (muId) return { scopeType: "mu", scopeId: muId };
  if (countryId) return { scopeType: "country", scopeId: countryId };
  if (partyId) return { scopeType: "party", scopeId: partyId };
  return null;
}

export function parseDonationPage(data: unknown): {
  items: ParsedDonation[];
  nextCursor: string | null;
} {
  // parse items; skip party and unparseable; nextCursor from page
}

export async function fetchDonationPage(
  warera: WareraRequester,
  opts: {
    scopeType: "mu" | "country";
    scopeId: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{ items: ParsedDonation[]; nextCursor: string | null }> {
  const input: Record<string, unknown> = {
    limit: opts.limit ?? 100,
    ...(opts.scopeType === "mu" ? { muId: opts.scopeId } : { countryId: opts.scopeId }),
  };
  if (opts.cursor) input.cursor = opts.cursor;

  try {
    const json = await warera.request<unknown>(
      wareraProcedurePath("donation.getManyPaginated", input),
      { ...DONATION_INIT, method: "GET" },
    );
    return parseDonationPage(unwrapTrpcData(json));
  } catch (err) {
    if (!isWareraGetRejectedError(err)) throw err;
    const json = await warera.request<unknown>("donation.getManyPaginated", {
      method: "POST",
      json: input,
      ...DONATION_INIT,
    });
    return parseDonationPage(unwrapTrpcData(json));
  }
}

export async function drainDonations(
  warera: WareraRequester,
  opts: { scopeType: "mu" | "country"; scopeId: string; limit?: number },
): Promise<ParsedDonation[]> {
  const out: ParsedDonation[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchDonationPage(warera, { ...opts, cursor });
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}
```

Fill in full parseOne body (required `userId`; amount via finite number; dates; leftover `payload`). Skip rows whose resolved scope is `party`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/warera/donations.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/donations.ts src/warera/donations.test.ts
git commit -m "$(cat <<'EOF'
feat(warera): drain donation.getManyPaginated pages

EOF
)"
```

---

### Task 4: Donation poll/snapshot DB helpers

**Files:**
- Create: `src/db/donations.ts`
- Create: `src/db/donations.test.ts`

**Interfaces:**
- Consumes: `donationPolls`, `donationSnapshots`
- Produces:
  - `DonationSnapshotRow = { scopeType, scopeId, userId, donationRowId, amount, donationCreatedAt, donationUpdatedAt, payload }`
  - `insertDonationPoll(db, { recordedAt, status, error?, scopeCount, rowCount }): Promise<number>`
  - `insertDonationSnapshots(db, pollId, rows): Promise<void>` (no-op on empty)

- [ ] **Step 1: Write failing tests with in-memory DDL matching schema**

```ts
describe("donations db", () => {
  it("inserts poll and snapshot rows", async () => {
    const pollId = await insertDonationPoll(db, {
      recordedAt: new Date("2026-09-03T12:00:00.000Z"),
      status: "success",
      scopeCount: 1,
      rowCount: 1,
    });
    await insertDonationSnapshots(db, pollId, [
      {
        scopeType: "mu",
        scopeId: "mu1",
        userId: "u1",
        donationRowId: "d1",
        amount: 100,
        donationCreatedAt: new Date("2026-04-01T00:00:00.000Z"),
        donationUpdatedAt: new Date("2026-09-01T00:00:00.000Z"),
        payload: null,
      },
    ]);
    // assert select counts / fields
  });

  it("no-ops on empty snapshot arrays", async () => {
    const pollId = await insertDonationPoll(db, {
      recordedAt: new Date(),
      status: "success",
      scopeCount: 0,
      rowCount: 0,
    });
    await expect(insertDonationSnapshots(db, pollId, [])).resolves.toBeUndefined();
  });
});
```

Create tables `donation_polls` / `donation_snapshots` in the test helper (mirror `mu-stats.test.ts` style).

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/db/donations.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `src/db/donations.ts`**

```ts
import type { Db } from "./client";
import { donationPolls, donationSnapshots } from "./schema";

export type DonationSnapshotRow = {
  scopeType: string;
  scopeId: string;
  userId: string;
  donationRowId: string | null;
  amount: number | null;
  donationCreatedAt: Date | null;
  donationUpdatedAt: Date | null;
  payload: Record<string, unknown> | null;
};

export async function insertDonationPoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: string;
    error?: string | null;
    scopeCount: number;
    rowCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(donationPolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      scopeCount: values.scopeCount,
      rowCount: values.rowCount,
    })
    .returning({ id: donationPolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert donation_polls row");
  return id;
}

export async function insertDonationSnapshots(
  db: Db,
  pollId: number,
  rows: DonationSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(donationSnapshots).values(
    rows.map((row) => ({
      pollId,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      userId: row.userId,
      donationRowId: row.donationRowId,
      amount: row.amount,
      donationCreatedAt: row.donationCreatedAt,
      donationUpdatedAt: row.donationUpdatedAt,
      payload: row.payload,
    })),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/db/donations.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/donations.ts src/db/donations.test.ts
git commit -m "$(cat <<'EOF'
feat(db): donation poll and snapshot insert helpers

EOF
)"
```

---

### Task 5: `donation-poll` job + registry

**Files:**
- Create: `src/jobs/donation-poll/run.ts`
- Create: `src/jobs/donation-poll/run.test.ts`
- Create: `src/jobs/donation-poll/index.ts`
- Modify: `src/jobs/registry.ts`

**Interfaces:**
- Consumes: `ensureSwedenCountryWatchReason`, `listDistinctWatchedMuIds`, `listDistinctWatchedCountryIds`, `drainDonations`, `insertDonationPoll`, `insertDonationSnapshots`
- Produces: `runDonationPoll({ db, warera, logger }) → { pollId, scopeCount, rowCount, status }`
- Job id `donation-poll`, cron `0 0 * * * *`, enabled by default

- [ ] **Step 1: Write failing job test**

Use in-memory DB with `mu_watch_reasons`, `country_watch_reasons`, `donation_polls`, `donation_snapshots`. Mock `warera.request` to return one MU page and one country page. Assert:

- Sweden ensured if missing
- one poll row `success`
- snapshot rows for both scopes
- second case: one scope throws → `partial`, other scope still written

Sketch:

```ts
it("writes snapshots for mu and country scopes", async () => {
  // seed mu watch reason; leave country empty so ensureSweden inserts
  const warera = {
    request: vi.fn(async (pathOrProc: string) => {
      const s = String(pathOrProc);
      if (s.includes("muId") || (typeof pathOrProc === "string" && s === "donation.getManyPaginated")) {
        // return appropriate page based on call args — prefer inspecting init.json / URL
      }
      return { result: { data: { items: [], nextCursor: null } } };
    }),
  };
  const result = await runDonationPoll({ db, warera: warera as never, logger: silentLogger });
  expect(result.status).toBe("success");
  expect(result.scopeCount).toBe(2);
  expect(result.rowCount).toBeGreaterThan(0);
});
```

Implement the mock carefully: `drainDonations` may call GET path first. Simplest approach: mock `request` to always return `{ result: { data: { items: [...], nextCursor: null } } }` and vary items by call index, **or** spy by reading the procedure path / POST body for `muId` vs `countryId`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/jobs/donation-poll/run.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `run.ts`**

```ts
export async function runDonationPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{
  pollId: number;
  scopeCount: number;
  rowCount: number;
  status: "success" | "partial" | "error";
}> {
  const { db, warera, logger } = options;
  const recordedAt = new Date();
  await ensureSwedenCountryWatchReason(db, recordedAt);

  const muIds = await listDistinctWatchedMuIds(db);
  const countryIds = await listDistinctWatchedCountryIds(db);
  const scopes: { scopeType: "mu" | "country"; scopeId: string }[] = [
    ...muIds.map((scopeId) => ({ scopeType: "mu" as const, scopeId })),
    ...countryIds.map((scopeId) => ({ scopeType: "country" as const, scopeId })),
  ];

  const errors: string[] = [];
  const rows: DonationSnapshotRow[] = [];
  let scopeSuccesses = 0;

  for (const scope of scopes) {
    try {
      const donations = await drainDonations(warera, scope);
      for (const d of donations) {
        rows.push({
          scopeType: d.scopeType,
          scopeId: d.scopeId,
          userId: d.userId,
          donationRowId: d.donationRowId,
          amount: d.amount,
          donationCreatedAt: d.donationCreatedAt,
          donationUpdatedAt: d.donationUpdatedAt,
          payload: d.payload,
        });
      }
      scopeSuccesses += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${scope.scopeType}:${scope.scopeId}: ${msg}`);
      logger.warn(
        { scope_type: scope.scopeType, scope_id: scope.scopeId, err: msg },
        "donation scope drain failed",
      );
    }
  }

  const status =
    scopes.length === 0
      ? errors.length > 0
        ? "partial"
        : "success"
      : scopeSuccesses === 0
        ? "error"
        : errors.length > 0 || scopeSuccesses < scopes.length
          ? "partial"
          : "success";

  const pollId = await insertDonationPoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
    scopeCount: scopeSuccesses,
    rowCount: rows.length,
  });
  await insertDonationSnapshots(db, pollId, rows);

  logger.info(
    { poll_id: pollId, scope_count: scopeSuccesses, row_count: rows.length, status, errors: errors.length },
    "donation poll complete",
  );

  return { pollId, scopeCount: scopeSuccesses, rowCount: rows.length, status };
}
```

Empty watchlists after Sweden ensure should still have ≥1 country scope.

- [ ] **Step 4: Implement `index.ts` and register**

```ts
export const donationPollJob: JobDefinition = {
  id: "donation-poll",
  name: "Donation Poll",
  description:
    "Hourly drain of donation.getManyPaginated for watched MUs and countries; appends donor running-total snapshots",
  defaultCron: "0 0 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runDonationPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.scopeCount} scopes, ${result.rowCount} rows (${result.status})`;
  },
};
```

In `registry.ts`, import and add `donationPollJob` near `muStatsPollJob` / `workStatsPollJob`.

- [ ] **Step 5: Run job tests + `vp check`**

Run:

```bash
vp test src/jobs/donation-poll/run.test.ts
vp check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/jobs/donation-poll/ src/jobs/registry.ts
git commit -m "$(cat <<'EOF'
feat(jobs): add hourly donation-poll for MU and country scopes

EOF
)"
```

---

### Task 6: Inventory + warera-api skill docs

**Files:**
- Modify: `docs/warera-api/inventory.md`
- Modify: `.agents/skills/warera-api/SKILL.md`
- Modify: `AGENTS.md` (Geo MU row / table only if a one-line addition stays accurate)

**Interfaces:**
- Consumes: shipped behavior from Tasks 1–5
- Produces: inventory rows + skill allowlist note

- [ ] **Step 1: Update inventory Geo table**

Add / adjust:

| Resource | What | Who refreshes | Cadence | Upstream | Storage | Consumers |
| --- | --- | --- | --- | --- | --- | --- |
| Country watchlist | Distinct country ids with watch reasons (seed Sweden manual) | Manual insert now; future auto-enqueue | On write | — | `country_watch_reasons` | `donation-poll` |
| Donations (MU/country) | Per-donor running totals for watched MUs + countries | `donation-poll` | Hourly | `donation.getManyPaginated` (api2 override) | Append `donation_polls` / `donation_snapshots` | Future MU weekly stats / rankings |

Bump **Last reviewed** date.

- [ ] **Step 2: Update warera-api skill endpoint index**

Add row:

| donation | `getManyPaginated`‡ |

With footnote: not on official OpenAPI; live api2 read used by donation poll — prefer GET, POST + `X-API-Key` fallback.

- [ ] **Step 3: Optional AGENTS.md one-liner**

Under Geo MU / countries, note country watch reasons drive donation poll (full `countries` catalog still from `country-sync`).

- [ ] **Step 4: Commit**

```bash
git add docs/warera-api/inventory.md .agents/skills/warera-api/SKILL.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs: inventory donation-poll and country watchlist

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `country_watch_reasons` + Sweden seed | 1, 2 |
| `donation_polls` / `donation_snapshots` with scope discriminator | 1, 4 |
| Reuse `mu_watch_reasons` for MU scopes | 5 |
| Hourly `donation-poll`, full drain limit 100 | 3, 5 |
| OpenAPI override client GET→POST api-key | 3 |
| Skip party writes | 3 |
| Partial failure per scope | 5 |
| No UI / read routes | (global — not implemented) |
| Inventory + skill note | 6 |
