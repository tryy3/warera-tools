# Economy Advisor API Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Economy advisor WarEra API chatter by caching recommended regions and regions behind hourly jobs, caching per-user company packs with a 10-minute TTL + manual refresh, and calling `getProductionBonus` on api2 directly.

**Architecture:** Three dedicated tables (`recommended_regions`, `regions`, `company_packs`) plus two Croner jobs mirroring `price-poll` / `country-sync`. Advisor reads DB first; on miss it live-fetches, persists, and serves. `refresh=1` busts only the company pack.

**Tech Stack:** TypeScript, Hono, Drizzle/Turso (libsql), existing job runner, Vitest via `vp test`, Vite+ (`vp check`).

**Design:** [2026-08-01-economy-advisor-api-caching-design.md](../specs/2026-08-01-economy-advisor-api-caching-design.md)

## Global Constraints

- Follow the design spec; do not use the generic `cache` KV for these domains
- Recommended-regions job covers **all** `listProducibleRecipes()` item codes
- Region watchlist = row presence in `regions`; enqueue is insert-if-missing
- Cold miss = live-fetch + persist + serve (never wait for hourly job)
- Company pack TTL default **600** seconds; manual refresh affects **only** company packs
- `getProductionBonus` must use api2 `baseUrl` (no gateway probe)
- Failed background refresh must not wipe a still-valid previous row
- Prefer `vp test` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | Add `recommended_regions`, `regions`, `company_packs` |
| `drizzle/0005_*.sql` (+ meta) | Migration (via `pnpm db:generate`) |
| `src/db/regions.ts` | Enqueue, get, upsert region rows |
| `src/db/regions.test.ts` | Enqueue-if-missing + upsert preserve-on-fail helpers |
| `src/db/recommended-regions.ts` | Get / upsert recommended region by itemCode |
| `src/db/recommended-regions.test.ts` | Upsert + read tests |
| `src/db/company-packs.ts` | TTL helper, get, upsert company packs |
| `src/db/company-packs.test.ts` | Freshness + upsert tests |
| `src/warera/companies.ts` | Force api2 for `getProductionBonus` |
| `src/warera/companies.test.ts` | Assert `baseUrl` on production-bonus request |
| `src/jobs/recommended-regions-poll/*` | Hourly poll all recipe item codes |
| `src/jobs/region-sync/*` | Hourly refresh known region ids |
| `src/jobs/registry.ts` | Register both jobs |
| `src/economy/advisor.ts` | Read/write caches; `refresh` flag; response meta |
| `src/economy/advisor.test.ts` | Warm-cache avoids WarEra; refresh forces pack fetch |
| `src/server/routes/economy.ts` | Pass `refresh` query to `buildAdvisor` |
| `src/web/features/economy/types.ts` | `companiesFetchedAt`, `companiesRefreshed` |
| `src/web/features/economy/EconomyPage.tsx` | Refresh companies button |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0005_*.sql` + `drizzle/meta/*` via generate

**Interfaces:**
- Consumes: existing drizzle schema patterns
- Produces: tables `recommended_regions`, `regions`, `company_packs` in schema

- [ ] **Step 1: Add tables to schema**

Append to `src/db/schema.ts`:

```ts
export const recommendedRegions = sqliteTable("recommended_regions", {
  itemCode: text("item_code").primaryKey(),
  regionId: text("region_id").notNull(),
  regionName: text("region_name"),
  bonus: real("bonus"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const regions = sqliteTable("regions", {
  id: text("id").primaryKey(),
  name: text("name"),
  countryCode: text("country_code"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
  enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" }).notNull(),
});

export const companyPacks = sqliteTable("company_packs", {
  userId: text("user_id").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull().$type<unknown>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull().default(600),
});
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`  
Expected: new `drizzle/0005_*.sql` creating the three tables; journal updated.

- [ ] **Step 3: Apply migration locally**

Run: `pnpm db:migrate`  
Expected: migrates without error.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add regions, recommended_regions, and company_packs tables"
```

---

### Task 2: Regions DB helpers

**Files:**
- Create: `src/db/regions.ts`
- Create: `src/db/regions.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema.regions`
- Produces:
  - `export type RegionRow = { id: string; name: string | null; countryCode: string | null; payload: Record<string, unknown> | null; fetchedAt: Date | null; enqueuedAt: Date }`
  - `export async function enqueueRegion(db: Db, regionId: string, now?: Date): Promise<boolean>` — `true` if inserted
  - `export async function getRegion(db: Db, regionId: string): Promise<RegionRow | null>`
  - `export async function listRegionsForSync(db: Db): Promise<RegionRow[]>` — null `fetchedAt` first, then oldest `fetchedAt`
  - `export async function upsertRegionFetched(db: Db, row: { id: string; name: string | null; countryCode: string | null; payload?: Record<string, unknown> | null; fetchedAt: Date }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import { enqueueRegion, getRegion, listRegionsForSync, upsertRegionFetched } from "./regions";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "regions-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE regions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      country_code TEXT,
      payload TEXT,
      fetched_at INTEGER,
      enqueued_at INTEGER NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

describe("regions db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("enqueues once and is idempotent", async () => {
    const t = new Date("2026-08-01T12:00:00.000Z");
    expect(await enqueueRegion(db, "r1", t)).toBe(true);
    expect(await enqueueRegion(db, "r1", t)).toBe(false);
    const row = await getRegion(db, "r1");
    expect(row?.fetchedAt).toBeNull();
    expect(row?.enqueuedAt.toISOString()).toBe(t.toISOString());
  });

  it("upserts fetched data without clearing on re-enqueue", async () => {
    await enqueueRegion(db, "r1", new Date("2026-08-01T12:00:00.000Z"));
    await upsertRegionFetched(db, {
      id: "r1",
      name: "Alpha",
      countryCode: "SE",
      fetchedAt: new Date("2026-08-01T12:05:00.000Z"),
    });
    await enqueueRegion(db, "r1");
    const row = await getRegion(db, "r1");
    expect(row?.name).toBe("Alpha");
    expect(row?.countryCode).toBe("SE");
    expect(row?.fetchedAt).not.toBeNull();
  });

  it("lists null fetched_at before older fetched rows", async () => {
    await upsertRegionFetched(db, {
      id: "old",
      name: "Old",
      countryCode: "NO",
      fetchedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    await enqueueRegion(db, "pending", new Date("2026-08-01T11:00:00.000Z"));
    await upsertRegionFetched(db, {
      id: "newer",
      name: "New",
      countryCode: "FI",
      fetchedAt: new Date("2026-08-01T11:30:00.000Z"),
    });
    const ids = (await listRegionsForSync(db)).map((r) => r.id);
    expect(ids[0]).toBe("pending");
    expect(ids.slice(1)).toEqual(["old", "newer"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/regions.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/db/regions.ts`**

```ts
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { regions } from "./schema";

export type RegionRow = {
  id: string;
  name: string | null;
  countryCode: string | null;
  payload: Record<string, unknown> | null;
  fetchedAt: Date | null;
  enqueuedAt: Date;
};

function mapRow(row: typeof regions.$inferSelect): RegionRow {
  return {
    id: row.id,
    name: row.name ?? null,
    countryCode: row.countryCode ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    fetchedAt: row.fetchedAt ?? null,
    enqueuedAt: row.enqueuedAt,
  };
}

/** Insert-if-missing. Returns true when a new watchlist row was created. */
export async function enqueueRegion(db: Db, regionId: string, now = new Date()): Promise<boolean> {
  const result = await db
    .insert(regions)
    .values({
      id: regionId,
      name: null,
      countryCode: null,
      payload: null,
      fetchedAt: null,
      enqueuedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: regions.id });
  return result.length > 0;
}

export async function getRegion(db: Db, regionId: string): Promise<RegionRow | null> {
  const rows = await db.select().from(regions).where(eq(regions.id, regionId)).limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listRegionsForSync(db: Db): Promise<RegionRow[]> {
  const rows = await db
    .select()
    .from(regions)
    .orderBy(sql`${regions.fetchedAt} IS NOT NULL`, asc(regions.fetchedAt), asc(regions.enqueuedAt));
  return rows.map(mapRow);
}

export async function upsertRegionFetched(
  db: Db,
  row: {
    id: string;
    name: string | null;
    countryCode: string | null;
    payload?: Record<string, unknown> | null;
    fetchedAt: Date;
  },
): Promise<void> {
  await db
    .insert(regions)
    .values({
      id: row.id,
      name: row.name,
      countryCode: row.countryCode,
      payload: row.payload ?? null,
      fetchedAt: row.fetchedAt,
      enqueuedAt: row.fetchedAt,
    })
    .onConflictDoUpdate({
      target: regions.id,
      set: {
        name: row.name,
        countryCode: row.countryCode,
        payload: row.payload ?? null,
        fetchedAt: row.fetchedAt,
      },
    });
}
```

Adjust `listRegionsForSync` ordering if libsql rejects the `IS NOT NULL` expression — equivalent: fetch all and sort in JS (nulls first, then by `fetchedAt` asc). Prefer working SQL; fallback to in-memory sort is acceptable.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/db/regions.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/regions.ts src/db/regions.test.ts
git commit -m "feat: add regions watchlist DB helpers"
```

---

### Task 3: Recommended-regions DB helpers

**Files:**
- Create: `src/db/recommended-regions.ts`
- Create: `src/db/recommended-regions.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema.recommendedRegions`
- Produces:
  - `export type RecommendedRegionRow = { itemCode: string; regionId: string; regionName: string | null; bonus: number | null; payload: Record<string, unknown> | null; fetchedAt: Date }`
  - `export async function getRecommendedRegion(db: Db, itemCode: string): Promise<RecommendedRegionRow | null>`
  - `export async function upsertRecommendedRegion(db: Db, row: Omit<RecommendedRegionRow, "fetchedAt"> & { fetchedAt: Date }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import { getRecommendedRegion, upsertRecommendedRegion } from "./recommended-regions";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "rec-regions-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE recommended_regions (
      item_code TEXT PRIMARY KEY NOT NULL,
      region_id TEXT NOT NULL,
      region_name TEXT,
      bonus REAL,
      payload TEXT,
      fetched_at INTEGER NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

describe("recommended_regions db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("upserts and reads by item code", async () => {
    await upsertRecommendedRegion(db, {
      itemCode: "steel",
      regionId: "r1",
      regionName: "Forge",
      bonus: 0.42,
      payload: { regionId: "r1" },
      fetchedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const row = await getRecommendedRegion(db, "steel");
    expect(row?.regionId).toBe("r1");
    expect(row?.bonus).toBe(0.42);
    await upsertRecommendedRegion(db, {
      itemCode: "steel",
      regionId: "r2",
      regionName: null,
      bonus: 0.5,
      payload: null,
      fetchedAt: new Date("2026-08-01T13:00:00.000Z"),
    });
    expect((await getRecommendedRegion(db, "steel"))?.regionId).toBe("r2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/recommended-regions.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/db/recommended-regions.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { recommendedRegions } from "./schema";

export type RecommendedRegionRow = {
  itemCode: string;
  regionId: string;
  regionName: string | null;
  bonus: number | null;
  payload: Record<string, unknown> | null;
  fetchedAt: Date;
};

export async function getRecommendedRegion(
  db: Db,
  itemCode: string,
): Promise<RecommendedRegionRow | null> {
  const rows = await db
    .select()
    .from(recommendedRegions)
    .where(eq(recommendedRegions.itemCode, itemCode))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    itemCode: row.itemCode,
    regionId: row.regionId,
    regionName: row.regionName ?? null,
    bonus: row.bonus ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    fetchedAt: row.fetchedAt,
  };
}

export async function upsertRecommendedRegion(
  db: Db,
  row: {
    itemCode: string;
    regionId: string;
    regionName: string | null;
    bonus: number | null;
    payload: Record<string, unknown> | null;
    fetchedAt: Date;
  },
): Promise<void> {
  await db
    .insert(recommendedRegions)
    .values({
      itemCode: row.itemCode,
      regionId: row.regionId,
      regionName: row.regionName,
      bonus: row.bonus,
      payload: row.payload,
      fetchedAt: row.fetchedAt,
    })
    .onConflictDoUpdate({
      target: recommendedRegions.itemCode,
      set: {
        regionId: row.regionId,
        regionName: row.regionName,
        bonus: row.bonus,
        payload: row.payload,
        fetchedAt: row.fetchedAt,
      },
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/db/recommended-regions.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/recommended-regions.ts src/db/recommended-regions.test.ts
git commit -m "feat: add recommended_regions DB helpers"
```

---

### Task 4: Company packs DB helpers

**Files:**
- Create: `src/db/company-packs.ts`
- Create: `src/db/company-packs.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema.companyPacks`, `ProductionBonusDetails` shape (inline type to avoid circular imports — duplicate minimal type or import from `../warera/companies`)
- Produces:
  - `export const DEFAULT_COMPANY_PACK_TTL_SECONDS = 600`
  - `export type CompanyPackEntry = { id: string; name: string; itemCode: string | null; regionId: string | null; aeLevel: number; productionBonus: number | null; bonusDetails: { total: number; strategicBonus: number; depositBonus: number; ethicSpecializationBonus: number; ethicDepositBonus: number; formula: string } | null }`
  - `export type CompanyPackRecord = { userId: string; companies: CompanyPackEntry[]; fetchedAt: Date; ttlSeconds: number }`
  - `export function isCompanyPackFresh(fetchedAt: Date, ttlSeconds: number, now?: Date): boolean`
  - `export async function getCompanyPack(db: Db, userId: string): Promise<CompanyPackRecord | null>`
  - `export async function upsertCompanyPack(db: Db, pack: { userId: string; companies: CompanyPackEntry[]; fetchedAt: Date; ttlSeconds?: number }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import {
  getCompanyPack,
  isCompanyPackFresh,
  upsertCompanyPack,
} from "./company-packs";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "company-packs-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE company_packs (
      user_id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_seconds INTEGER NOT NULL DEFAULT 600
    )
  `);
  return drizzle(client, { schema });
}

describe("company_packs", () => {
  it("isCompanyPackFresh respects TTL", () => {
    const fetchedAt = new Date("2026-08-01T12:00:00.000Z");
    expect(isCompanyPackFresh(fetchedAt, 600, new Date("2026-08-01T12:09:59.000Z"))).toBe(true);
    expect(isCompanyPackFresh(fetchedAt, 600, new Date("2026-08-01T12:10:00.000Z"))).toBe(false);
  });

  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("upserts and reads pack payload", async () => {
    const fetchedAt = new Date("2026-08-01T12:00:00.000Z");
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "c1",
          name: "Mine",
          itemCode: "iron",
          regionId: "r1",
          aeLevel: 3,
          productionBonus: 0.2,
          bonusDetails: null,
        },
      ],
      fetchedAt,
    });
    const pack = await getCompanyPack(db, "u1");
    expect(pack?.companies[0]?.id).toBe("c1");
    expect(pack?.ttlSeconds).toBe(600);
    expect(pack?.fetchedAt.toISOString()).toBe(fetchedAt.toISOString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/company-packs.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/db/company-packs.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { companyPacks } from "./schema";

export const DEFAULT_COMPANY_PACK_TTL_SECONDS = 600;

export type CompanyPackEntry = {
  id: string;
  name: string;
  itemCode: string | null;
  regionId: string | null;
  aeLevel: number;
  productionBonus: number | null;
  bonusDetails: {
    total: number;
    strategicBonus: number;
    depositBonus: number;
    ethicSpecializationBonus: number;
    ethicDepositBonus: number;
    formula: string;
  } | null;
};

export type CompanyPackRecord = {
  userId: string;
  companies: CompanyPackEntry[];
  fetchedAt: Date;
  ttlSeconds: number;
};

export function isCompanyPackFresh(
  fetchedAt: Date,
  ttlSeconds: number,
  now = new Date(),
): boolean {
  return now.getTime() - fetchedAt.getTime() < ttlSeconds * 1000;
}

export async function getCompanyPack(db: Db, userId: string): Promise<CompanyPackRecord | null> {
  const rows = await db.select().from(companyPacks).where(eq(companyPacks.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const companies = Array.isArray(row.payload) ? (row.payload as CompanyPackEntry[]) : [];
  return {
    userId: row.userId,
    companies,
    fetchedAt: row.fetchedAt,
    ttlSeconds: row.ttlSeconds,
  };
}

export async function upsertCompanyPack(
  db: Db,
  pack: {
    userId: string;
    companies: CompanyPackEntry[];
    fetchedAt: Date;
    ttlSeconds?: number;
  },
): Promise<void> {
  const ttlSeconds = pack.ttlSeconds ?? DEFAULT_COMPANY_PACK_TTL_SECONDS;
  await db
    .insert(companyPacks)
    .values({
      userId: pack.userId,
      payload: pack.companies,
      fetchedAt: pack.fetchedAt,
      ttlSeconds,
    })
    .onConflictDoUpdate({
      target: companyPacks.userId,
      set: {
        payload: pack.companies,
        fetchedAt: pack.fetchedAt,
        ttlSeconds,
      },
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/db/company-packs.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/company-packs.ts src/db/company-packs.test.ts
git commit -m "feat: add company_packs TTL cache helpers"
```

---

### Task 5: `getProductionBonus` → api2 direct

**Files:**
- Modify: `src/warera/companies.ts` (`fetchCompanyProductionBonus`)
- Modify: `src/warera/companies.test.ts` (add/extend)

**Interfaces:**
- Consumes: `WareraRequester.request`
- Produces: same return type; request must include `baseUrl: "https://api2.warera.io/trpc"`

- [ ] **Step 1: Write the failing test**

In `src/warera/companies.test.ts` add (create file if only partial coverage exists — extend existing):

```ts
import { describe, expect, it, vi } from "vite-plus/test";
import { fetchCompanyProductionBonus } from "./companies";

describe("fetchCompanyProductionBonus", () => {
  it("calls api2 directly (skips gateway)", async () => {
    const request = vi.fn(async () => ({
      result: {
        data: {
          total: 50.5,
          strategicBonus: 10,
          depositBonus: 20,
          ethicSpecializationBonus: 15,
          ethicDepositBonus: 5.5,
        },
      },
    }));
    await fetchCompanyProductionBonus({ request }, "company-1");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("company.getProductionBonus"),
      expect.objectContaining({ baseUrl: "https://api2.warera.io/trpc" }),
    );
  });
});
```

If `wareraProcedurePath` returns a path string as first arg, match that; if options are the only second arg, assert `baseUrl` there. Align the assertion with the actual `request` signature used by `fetchBestRecommendedRegion`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/warera/companies.test.ts`  
Expected: FAIL (missing `baseUrl` in call)

- [ ] **Step 3: Implement**

In `fetchCompanyProductionBonus`, change the request to:

```ts
const json = await warera.request<unknown>(
  wareraProcedurePath("company.getProductionBonus", { companyId }),
  { baseUrl: "https://api2.warera.io/trpc" },
);
```

Keep existing parse / soft-fail `catch → null` behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/warera/companies.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/companies.ts src/warera/companies.test.ts
git commit -m "fix: call getProductionBonus on api2 directly"
```

---

### Task 6: Recommended-regions poll job

**Files:**
- Create: `src/jobs/recommended-regions-poll/run.ts`
- Create: `src/jobs/recommended-regions-poll/index.ts`
- Create: `src/jobs/recommended-regions-poll/run.test.ts`
- Modify: `src/jobs/registry.ts`

**Interfaces:**
- Consumes: `listProducibleRecipes`, `fetchBestRecommendedRegion`, `upsertRecommendedRegion`, `enqueueRegion`
- Produces: `export async function runRecommendedRegionsPoll(options: { db: Db; warera: WareraRequester; logger: Logger }): Promise<{ itemCount: number; status: "success" | "partial" | "error"; errors: number }>`
- Job id: `recommended-regions-poll`, defaultCron: `0 0 * * * *`

- [ ] **Step 1: Write the failing test**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { getRecommendedRegion } from "../../db/recommended-regions";
import { getRegion } from "../../db/regions";
import * as schema from "../../db/schema";
import { listProducibleRecipes } from "../../economy/recipes";
import { runRecommendedRegionsPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "rec-poll-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE recommended_regions (
      item_code TEXT PRIMARY KEY NOT NULL,
      region_id TEXT NOT NULL,
      region_name TEXT,
      bonus REAL,
      payload TEXT,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE regions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      country_code TEXT,
      payload TEXT,
      fetched_at INTEGER,
      enqueued_at INTEGER NOT NULL
    );
  `);
  return drizzle(client, { schema });
}

describe("runRecommendedRegionsPoll", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("upserts each recipe item and enqueues region ids", async () => {
    const warera = {
      request: vi.fn(async (_path: string, opts?: { json?: { itemCode: string } }) => {
        const itemCode = opts?.json?.itemCode ?? "unknown";
        return {
          result: {
            data: [{ regionId: `reg-${itemCode}`, name: "R", bonus: 12 }],
          },
        };
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await runRecommendedRegionsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("success");
    expect(result.itemCount).toBe(listProducibleRecipes().length);
    const steel = await getRecommendedRegion(db, "steel");
    expect(steel?.regionId).toBe("reg-steel");
    expect(await getRegion(db, "reg-steel")).not.toBeNull();
  });

  it("marks partial when one item fails", async () => {
    const warera = {
      request: vi.fn(async (_path: string, opts?: { json?: { itemCode: string } }) => {
        const itemCode = opts?.json?.itemCode ?? "unknown";
        if (itemCode === "steel") throw new Error("boom");
        return {
          result: { data: [{ regionId: `reg-${itemCode}`, name: "R", bonus: 10 }] },
        };
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await runRecommendedRegionsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("partial");
    expect(result.errors).toBeGreaterThan(0);
    expect(await getRecommendedRegion(db, "iron")).not.toBeNull();
    expect(await getRecommendedRegion(db, "steel")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/jobs/recommended-regions-poll/run.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement run + job definition**

`src/jobs/recommended-regions-poll/run.ts`:

```ts
import { upsertRecommendedRegion } from "../../db/recommended-regions";
import { enqueueRegion } from "../../db/regions";
import type { Db } from "../../db/client";
import { listProducibleRecipes } from "../../economy/recipes";
import type { Logger } from "../../logging/logger";
import { fetchBestRecommendedRegion } from "../../warera/companies";
import type { WareraRequester } from "../../warera/prices";

export async function runRecommendedRegionsPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{ itemCount: number; status: "success" | "partial" | "error"; errors: number }> {
  const { db, warera, logger } = options;
  const codes = listProducibleRecipes().map((r) => r.itemCode);
  let errors = 0;
  let itemCount = 0;
  const now = new Date();

  for (const itemCode of codes) {
    try {
      const region = await fetchBestRecommendedRegion(warera, itemCode);
      if (!region) {
        errors += 1;
        logger.warn({ itemCode }, "recommended region empty");
        continue;
      }
      await upsertRecommendedRegion(db, {
        itemCode,
        regionId: region.regionId,
        regionName: region.regionName,
        bonus: region.bonus,
        payload: { regionId: region.regionId, regionName: region.regionName, bonus: region.bonus },
        fetchedAt: now,
      });
      await enqueueRegion(db, region.regionId, now);
      itemCount += 1;
    } catch (err) {
      errors += 1;
      logger.warn(
        { itemCode, err: err instanceof Error ? err.message : String(err) },
        "recommended region poll failed",
      );
    }
  }

  const status =
    itemCount === 0 && errors > 0 ? "error" : errors > 0 ? "partial" : "success";
  return { itemCount, status, errors };
}
```

`src/jobs/recommended-regions-poll/index.ts`:

```ts
import type { JobDefinition } from "../types";
import { runRecommendedRegionsPoll } from "./run";

export const recommendedRegionsPollJob: JobDefinition = {
  id: "recommended-regions-poll",
  name: "Recommended Regions Poll",
  description: "Fetches best recommended region per producible item code; upserts cache",
  defaultCron: "0 0 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runRecommendedRegionsPoll({ db, warera, logger });
    return `${result.itemCount} items (${result.status}, ${result.errors} errors)`;
  },
};
```

Register in `src/jobs/registry.ts` `listJobDefinitions()` array.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/jobs/recommended-regions-poll/run.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/jobs/recommended-regions-poll/ src/jobs/registry.ts
git commit -m "feat: add hourly recommended-regions poll job"
```

---

### Task 7: Region sync job

**Files:**
- Create: `src/jobs/region-sync/run.ts`
- Create: `src/jobs/region-sync/index.ts`
- Create: `src/jobs/region-sync/run.test.ts`
- Modify: `src/jobs/registry.ts`

**Interfaces:**
- Consumes: `listRegionsForSync`, `upsertRegionFetched`, `fetchRegionInfo` (or raw `region.getById` + `parseRegionInfo`)
- Produces: `export async function runRegionSync(...): Promise<{ regionCount: number; status: "success" | "partial" | "error"; errors: number }>`
- Job id: `region-sync`, defaultCron: `0 5 * * * *` (stagger 5 min after recommended poll)

- [ ] **Step 1: Write the failing test**

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { enqueueRegion, getRegion } from "../../db/regions";
import * as schema from "../../db/schema";
import { runRegionSync } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "region-sync-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE regions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      country_code TEXT,
      payload TEXT,
      fetched_at INTEGER,
      enqueued_at INTEGER NOT NULL
    );
  `);
  return drizzle(client, { schema });
}

describe("runRegionSync", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("no-ops successfully on empty watchlist", async () => {
    const request = vi.fn();
    const result = await runRegionSync({
      db,
      warera: { request } as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });
    expect(result).toEqual({ regionCount: 0, status: "success", errors: 0 });
    expect(request).not.toHaveBeenCalled();
  });

  it("fetches pending regions and upserts name/country", async () => {
    await enqueueRegion(db, "r1", new Date("2026-08-01T12:00:00.000Z"));
    const warera = {
      request: vi.fn(async () => ({
        result: { data: { name: "City", countryCode: "SE" } },
      })),
    };
    const result = await runRegionSync({
      db,
      warera: warera as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });
    expect(result.status).toBe("success");
    expect(result.regionCount).toBe(1);
    const row = await getRegion(db, "r1");
    expect(row?.name).toBe("City");
    expect(row?.countryCode).toBe("SE");
    expect(row?.fetchedAt).not.toBeNull();
  });

  it("keeps prior data when one refresh throws", async () => {
    await enqueueRegion(db, "ok", new Date("2026-08-01T12:00:00.000Z"));
    await enqueueRegion(db, "bad", new Date("2026-08-01T12:00:00.000Z"));
    const warera = {
      request: vi.fn(async (path: string) => {
        if (String(path).includes("bad")) throw new Error("upstream");
        return { result: { data: { name: "OkCity", countryCode: "NO" } } };
      }),
    };
    // Requires fetchRegionInfoOrThrow (or equivalent) so throws propagate.
    const result = await runRegionSync({
      db,
      warera: warera as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    });
    expect(result.status).toBe("partial");
    expect((await getRegion(db, "ok"))?.name).toBe("OkCity");
    expect((await getRegion(db, "bad"))?.fetchedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/jobs/region-sync/run.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// src/jobs/region-sync/run.ts
import { listRegionsForSync, upsertRegionFetched } from "../../db/regions";
import type { Db } from "../../db/client";
import type { Logger } from "../../logging/logger";
import { fetchRegionInfo } from "../../warera/companies";
import type { WareraRequester } from "../../warera/prices";

export async function runRegionSync(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{ regionCount: number; status: "success" | "partial" | "error"; errors: number }> {
  const { db, warera, logger } = options;
  const list = await listRegionsForSync(db);
  if (list.length === 0) return { regionCount: 0, status: "success", errors: 0 };

  let errors = 0;
  let regionCount = 0;
  const now = new Date();

  for (const row of list) {
    try {
      const info = await fetchRegionInfo(warera, row.id);
      // Soft-empty name/country still counts as a successful refresh (updates fetchedAt).
      await upsertRegionFetched(db, {
        id: row.id,
        name: info.name,
        countryCode: info.countryCode,
        fetchedAt: now,
      });
      regionCount += 1;
    } catch (err) {
      errors += 1;
      logger.warn(
        { regionId: row.id, err: err instanceof Error ? err.message : String(err) },
        "region sync failed",
      );
      // Do not clear previous name/country/fetchedAt on failure.
    }
  }

  const status =
    regionCount === 0 && errors > 0 ? "error" : errors > 0 ? "partial" : "success";
  return { regionCount, status, errors };
}
```

Job definition + register in registry.

Note: `fetchRegionInfo` currently catches and returns nulls — for sync, either (a) use a throwing variant / raw request so real failures increment `errors`, or (b) treat all-null after request as success. Prefer (a): add `fetchRegionInfoOrThrow` in `companies.ts` used by the job, keep soft `fetchRegionInfo` for advisor live path. Include that helper in this task if needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/jobs/region-sync/run.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/jobs/region-sync/ src/jobs/registry.ts src/warera/companies.ts
git commit -m "feat: add hourly region-sync job"
```

---

### Task 8: Wire advisor to caches

**Files:**
- Modify: `src/economy/advisor.ts`
- Create: `src/economy/advisor.test.ts`

**Interfaces:**
- Consumes: company-packs / regions / recommended-regions helpers; existing warera fetchers
- Produces: `buildAdvisor` options gain `refresh?: boolean`; return type gains `companiesFetchedAt: number | null` and `companiesRefreshed: boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vite-plus/test";
// Use temp DB with prices + three cache tables, or mock db helpers.
// Core assertions:

it("warm caches: no recommended/region WarEra calls; serves company pack", async () => {
  // Seed company_packs (fresh), recommended_regions for all producible codes,
  // regions for company + recommended region ids, and a price poll/snapshots.
  // Mock warera.request → throw if called for getRecommendedRegionIdsByItemCode or region.getById
  // or getCompanies/getById/getProductionBonus.
  // buildAdvisor → companies length > 0, companiesRefreshed === false
});

it("refresh=true refetches company pack even when fresh", async () => {
  // Seed fresh pack; mock warera company fetches; call buildAdvisor({ refresh: true })
  // Expect warera company calls and companiesRefreshed === true
});

it("miss on recommended region live-fetches and persists", async () => {
  // Empty recommended_regions; mock fetchBestRecommendedRegion once;
  // after buildAdvisor, getRecommendedRegion(db, item) is populated
});
```

Implement with real temp DB tables (prices minimal: one success poll + concrete/iron snapshots as needed for math). Keep mocks only on `warera.request`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/economy/advisor.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement advisor wiring**

Update `buildAdvisor`:

1. Accept `refresh?: boolean`.
2. Company pack:
   - `const existing = await getCompanyPack(db, userId)`
   - `const fresh = existing && isCompanyPackFresh(existing.fetchedAt, existing.ttlSeconds)`
   - If `!refresh && fresh`: use `existing.companies` → map to `CompanySummary` (+ `bonusDetails` from entry); `companiesRefreshed = false`; `companiesFetchedAt = existing.fetchedAt.getTime()`
   - Else: `fetchCompaniesByUserId` + per-company `fetchCompanyProductionBonus` when needed; build `CompanyPackEntry[]`; `upsertCompanyPack`; enqueue each `regionId`; `companiesRefreshed = true`
3. Replace `regionInfo` helper:
   - `getRegion(db, id)` if `fetchedAt` present → return `{ name, countryCode }`
   - Else live `fetchRegionInfo`, `upsertRegionFetched`, `enqueueRegion` (enqueue first is fine)
4. Replace `bestRegion` helper:
   - `getRecommendedRegion(db, itemCode)` hit → map to `RecommendedRegion` (`bonus` default 0 if null)
   - Miss → `fetchBestRecommendedRegion`; on success `upsertRecommendedRegion` + `enqueueRegion`
5. Return `{ ..., companiesFetchedAt, companiesRefreshed }` alongside existing fields.

Do not change Profit/PP / switch selection math.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test src/economy/advisor.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/economy/advisor.ts src/economy/advisor.test.ts
git commit -m "feat: serve economy advisor from region and company caches"
```

---

### Task 9: API `refresh` + UI Refresh companies

**Files:**
- Modify: `src/server/routes/economy.ts`
- Modify: `src/web/features/economy/types.ts`
- Modify: `src/web/features/economy/EconomyPage.tsx`

**Interfaces:**
- Consumes: `buildAdvisor({ refresh })`
- Produces: query `refresh=1` / `refresh=true`; UI button calls advisor with refresh

- [ ] **Step 1: Update route**

```ts
app.get("/advisor", async (c) => {
  const userId = (c.req.query("userId") ?? "").trim();
  if (!userId) {
    throw new HttpError(400, "invalid_query", "userId is required");
  }
  const refreshRaw = (c.req.query("refresh") ?? "").trim().toLowerCase();
  const refresh = refreshRaw === "1" || refreshRaw === "true";
  try {
    const result = await buildAdvisor({ db, warera, logger, userId, refresh });
    return c.json(result);
  } catch (err) {
    throw new HttpError(
      502,
      "upstream_error",
      err instanceof Error ? err.message : "Advisor failed",
    );
  }
});
```

- [ ] **Step 2: Update web types**

```ts
export type AdvisorResponse = {
  recordedAt: string | null;
  companiesFetchedAt: number | null;
  companiesRefreshed: boolean;
  opportunities: Opportunity[];
  companies: CompanyAdvisorRow[];
};
```

- [ ] **Step 3: UI — Refresh companies**

In `EconomyPage.tsx`:

- Add `refreshingCompanies` state.
- Add `async function refreshCompanies()` that calls  
  `/api/economy/advisor?userId=…&refresh=1` and `setAdvisor`.
- Place a **Refresh companies** button near the “Showing companies for …” line (or next to Companies `h2`), disabled when `!selectedUserId || refreshingCompanies || loadingAdvisor`.
- Optionally show `companiesFetchedAt` as muted text:  
  `companies as of ${new Date(advisor.companiesFetchedAt).toLocaleString()}`.

Do **not** call `/api/prices/poll` from this button.

- [ ] **Step 4: Verify**

Run: `vp check` and `vp test`  
Expected: typecheck/lint/format clean; tests pass.

Manual smoke (optional): open Economy, select user, confirm warm reload is fast; click Refresh companies; confirm logs show company fetches but not a flood of recommended-region calls if cache warm.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/economy.ts src/web/features/economy/types.ts src/web/features/economy/EconomyPage.tsx
git commit -m "feat: add refresh companies control for economy advisor"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Dedicated tables (not KV) | 1–4 |
| Hourly recommended-regions for all recipes | 6 |
| Region watchlist + hourly sync | 2, 7 |
| Live miss persist | 8 |
| Company pack 10m TTL | 4, 8 |
| Refresh only company pack | 8, 9 |
| `getProductionBonus` → api2 | 5 |
| Response `companiesFetchedAt` / `companiesRefreshed` | 8, 9 |
| UI Refresh companies | 9 |
| Soft-fail / no wipe on job failure | 6, 7 |
| Staggered crons | 6 (`:00`), 7 (`:05`) |
