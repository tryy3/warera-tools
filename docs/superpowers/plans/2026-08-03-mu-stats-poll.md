# MU Stats Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 30-minute Croner job that watches MUs in a DB watchlist, upserts current identity/roster, and appends typed MU + member stat snapshots for later graphs—no UI.

**Architecture:** Mirror `price-poll` (poll row + snapshot children) and `region-sync` (row presence = watchlist). `mu.getById` via gateway; `muMember.getByMu` forced to api2 (OpenAPI override). Seed MU `69e5dc36f7b095e977052f7b` when the watchlist is empty.

**Tech Stack:** TypeScript, Drizzle/Turso (libsql), Croner jobs, Vitest via `vp test`, Vite+ (`vp check` / `vp run db:generate`).

**Design:** [2026-08-03-mu-stats-poll-design.md](../specs/2026-08-03-mu-stats-poll-design.md)

## Global Constraints

- No UI, charts, or Hono read routes in this slice
- Geo tier: jobs own refresh; `mus` row presence = watchlist
- Typed columns for known scalars; JSON only for nested/unknown (`roles`, `active_upgrade_levels`, `payload`)
- Seed MU id: `69e5dc36f7b095e977052f7b`
- Cadence: `0 */30 * * * *`, default enabled
- Retention: keep forever (no prune)
- `muMember.getByMu` is an intentional OpenAPI override — call api2 directly
- Use existing `WareraRequester` / rate limiter — no parallel HTTP stack
- Prefer `vp test` / `vp check` for verification
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | `mus`, `mu_members`, `mu_polls`, `mu_stat_snapshots`, `mu_member_stat_snapshots` |
| `drizzle/0007_*.sql` (+ meta) | Migration via `vp run db:generate` |
| `src/warera/mu.ts` | Parse + fetch `mu.getById` / `muMember.getByMu` |
| `src/warera/mu.test.ts` | Parser + request path tests |
| `src/db/mus.ts` | Enqueue/seed, list, upsert MU, sync roster |
| `src/db/mus.test.ts` | Watchlist + roster tests |
| `src/db/mu-stats.ts` | Insert poll + MU/member snapshots |
| `src/db/mu-stats.test.ts` | Poll/snapshot insert tests |
| `src/jobs/mu-stats-poll/run.ts` | Job orchestration |
| `src/jobs/mu-stats-poll/index.ts` | JobDefinition |
| `src/jobs/mu-stats-poll/run.test.ts` | Mocked Warera end-to-end job test |
| `src/jobs/registry.ts` | Register `mu-stats-poll` |
| `.agents/skills/warera-api/SKILL.md` | Document `muMember.getByMu` override |
| `AGENTS.md` | Mention MU job under Geo / jobs if a one-line fit exists |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0007_*.sql` + `drizzle/meta/*` via generate

**Interfaces:**
- Consumes: existing drizzle sqlite patterns in `schema.ts`
- Produces: tables `mus`, `mu_members`, `mu_polls`, `mu_stat_snapshots`, `mu_member_stat_snapshots`

- [ ] **Step 1: Append tables to `src/db/schema.ts`**

Add imports if missing: `primaryKey` from `drizzle-orm/sqlite-core` (keep existing `index`, `integer`, `real`, `sqliteTable`, `text`).

```ts
export const muPollStatuses = ["success", "partial", "error"] as const;
export type MuPollStatus = (typeof muPollStatuses)[number];

export const mus = sqliteTable("mus", {
  id: text("id").primaryKey(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  countryId: text("country_id"),
  regionId: text("region_id"),
  ownerUserId: text("owner_user_id"),
  mercenaryReputation: real("mercenary_reputation"),
  level: integer("level"),
  createdAtGame: integer("created_at_game", { mode: "timestamp_ms" }),
  roles: text("roles", { mode: "json" }).$type<Record<string, unknown> | null>(),
  activeUpgradeLevels: text("active_upgrade_levels", {
    mode: "json",
  }).$type<Record<string, unknown> | null>(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
});

export const muMembers = sqliteTable(
  "mu_members",
  {
    muId: text("mu_id")
      .notNull()
      .references(() => mus.id),
    userId: text("user_id").notNull(),
    role: text("role"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.muId, t.userId] })],
);

export const muPolls = sqliteTable(
  "mu_polls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    error: text("error"),
    muCount: integer("mu_count").notNull().default(0),
    memberCount: integer("member_count").notNull().default(0),
  },
  (t) => [index("mu_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const muStatSnapshots = sqliteTable(
  "mu_stat_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => muPolls.id),
    muId: text("mu_id").notNull(),
    weeklyDamages: real("weekly_damages"),
    weeklyDamagesRank: integer("weekly_damages_rank"),
    weeklyDamagesTier: text("weekly_damages_tier"),
    bounty: real("bounty"),
    bountyRank: integer("bounty_rank"),
    bountyTier: text("bounty_tier"),
    reputation: real("reputation"),
    reputationRank: integer("reputation_rank"),
    reputationTier: text("reputation_tier"),
    damages: real("damages"),
    damagesRank: integer("damages_rank"),
    damagesTier: text("damages_tier"),
    terrain: real("terrain"),
    terrainRank: integer("terrain_rank"),
    terrainTier: text("terrain_tier"),
    wealth: real("wealth"),
    wealthRank: integer("wealth_rank"),
    wealthTier: text("wealth_tier"),
    levelingLevel: integer("leveling_level"),
    levelingMonthlyDamages: real("leveling_monthly_damages"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (t) => [index("mu_stat_snapshots_mu_poll_idx").on(t.muId, t.pollId)],
);

export const muMemberStatSnapshots = sqliteTable(
  "mu_member_stat_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => muPolls.id),
    muId: text("mu_id").notNull(),
    userId: text("user_id").notNull(),
    memberRowId: text("member_row_id"),
    totalDamagesCount: integer("total_damages_count"),
    monthlyDamagesCount: integer("monthly_damages_count"),
    weeklyDamagesCount: integer("weekly_damages_count"),
    totalHelpCount: integer("total_help_count"),
    monthlyHelpCount: integer("monthly_help_count"),
    weeklyHelpCount: integer("weekly_help_count"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (t) => [index("mu_member_stat_snapshots_mu_user_poll_idx").on(t.muId, t.userId, t.pollId)],
);
```

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate`

Expected: new `drizzle/0007_*.sql` creating the five tables + indexes.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add MU watchlist and stats snapshot tables"
```

---

### Task 2: WarEra MU client

**Files:**
- Create: `src/warera/mu.ts`
- Create: `src/warera/mu.test.ts`
- Modify: `.agents/skills/warera-api/SKILL.md` (document override)

**Interfaces:**
- Consumes: `WareraRequester` from `src/warera/prices.ts`; `unwrapTrpcData`, `wareraProcedurePath` from `src/warera/trpc.ts`
- Produces:
  - `SEED_MU_ID = "69e5dc36f7b095e977052f7b"`
  - `parseMuById(raw: unknown): ParsedMu`
  - `parseMuMembers(raw: unknown): ParsedMuMember[]`
  - `fetchMuById(warera, muId): Promise<ParsedMu>`
  - `fetchMuMembersByMu(warera, muId): Promise<ParsedMuMember[]>`

- [ ] **Step 1: Write failing parser tests**

Create `src/warera/mu.test.ts`:

```ts
import { describe, expect, it, vi } from "vite-plus/test";
import {
  fetchMuById,
  fetchMuMembersByMu,
  parseMuById,
  parseMuMembers,
} from "./mu";

const muFixture = {
  _id: "69e5dc36f7b095e977052f7b",
  name: "Sweed Liberty",
  user: "owner1",
  region: "reg1",
  country: "cty1",
  avatarUrl: "https://example.com/a.png",
  mercenaryReputation: 1.2,
  members: ["u1", "u2", "owner1"],
  roles: { managers: ["m1"], commanders: ["u1"] },
  leveling: { level: 1, monthlyDamages: 10 },
  activeUpgradeLevels: { headquarters: 4, dormitories: 5 },
  rankings: {
    muWeeklyDamages: { value: 100, rank: 1, tier: "gold" },
    muBounty: { value: 2.5, rank: 2, tier: "silver" },
    muReputation: { value: 1.2, rank: 3, tier: "gold" },
    muDamages: { value: 999, rank: 4, tier: "platinum" },
    muTerrain: { value: 50, rank: 5, tier: "gold" },
    muWealth: { value: 7, rank: 6, tier: "platinum" },
  },
  createdAt: "2026-04-20T07:56:38.148Z",
  updatedAt: "2026-08-03T12:00:58.000Z",
  __v: 0,
  extraNested: { keep: true },
};

describe("parseMuById", () => {
  it("extracts identity, roster, roles, and ranking stats", () => {
    const parsed = parseMuById(muFixture);
    expect(parsed.id).toBe("69e5dc36f7b095e977052f7b");
    expect(parsed.name).toBe("Sweed Liberty");
    expect(parsed.ownerUserId).toBe("owner1");
    expect(parsed.memberUserIds).toEqual(["u1", "u2", "owner1"]);
    expect(parsed.stats.weeklyDamages).toBe(100);
    expect(parsed.stats.bountyRank).toBe(2);
    expect(parsed.stats.levelingMonthlyDamages).toBe(10);
    expect(parsed.level).toBe(1);
    expect(parsed.roles).toEqual({ managers: ["m1"], commanders: ["u1"] });
  });
});

describe("parseMuMembers", () => {
  it("maps member counter rows", () => {
    const rows = parseMuMembers([
      {
        _id: "row1",
        mu: "mu1",
        user: "u1",
        totalDamagesCount: 10,
        monthlyDamagesCount: 2,
        weeklyDamagesCount: 1,
        totalHelpCount: 3,
        monthlyHelpCount: 1,
        weeklyHelpCount: 0,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memberRowId: "row1",
      muId: "mu1",
      userId: "u1",
      totalDamagesCount: 10,
      weeklyHelpCount: 0,
    });
  });
});

describe("fetch helpers", () => {
  it("calls mu.getById with muId input", async () => {
    const request = vi.fn().mockResolvedValue({ result: { data: muFixture } });
    const parsed = await fetchMuById({ request }, "69e5dc36f7b095e977052f7b");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("mu.getById"),
      undefined,
    );
    expect(parsed.name).toBe("Sweed Liberty");
  });

  it("forces api2 for muMember.getByMu", async () => {
    const request = vi.fn().mockResolvedValue({
      result: {
        data: [
          {
            _id: "row1",
            mu: "mu1",
            user: "u1",
            totalDamagesCount: 1,
            monthlyDamagesCount: 0,
            weeklyDamagesCount: 0,
            totalHelpCount: 0,
            monthlyHelpCount: 0,
            weeklyHelpCount: 0,
          },
        ],
      },
    });
    await fetchMuMembersByMu({ request }, "mu1");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("muMember.getByMu"),
      expect.objectContaining({
        baseUrl: "https://api2.warera.io/trpc",
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/warera/mu.test.ts`

Expected: FAIL (module / exports missing).

- [ ] **Step 3: Implement `src/warera/mu.ts`**

```ts
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export const SEED_MU_ID = "69e5dc36f7b095e977052f7b";

export type RankingStat = {
  value: number | null;
  rank: number | null;
  tier: string | null;
};

export type ParsedMuStats = {
  weeklyDamages: number | null;
  weeklyDamagesRank: number | null;
  weeklyDamagesTier: string | null;
  bounty: number | null;
  bountyRank: number | null;
  bountyTier: string | null;
  reputation: number | null;
  reputationRank: number | null;
  reputationTier: string | null;
  damages: number | null;
  damagesRank: number | null;
  damagesTier: string | null;
  terrain: number | null;
  terrainRank: number | null;
  terrainTier: string | null;
  wealth: number | null;
  wealthRank: number | null;
  wealthTier: string | null;
  levelingLevel: number | null;
  levelingMonthlyDamages: number | null;
};

export type ParsedMu = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  countryId: string | null;
  regionId: string | null;
  ownerUserId: string | null;
  mercenaryReputation: number | null;
  level: number | null;
  createdAtGame: Date | null;
  memberUserIds: string[];
  roles: Record<string, unknown> | null;
  activeUpgradeLevels: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  stats: ParsedMuStats;
};

export type ParsedMuMember = {
  memberRowId: string | null;
  muId: string;
  userId: string;
  totalDamagesCount: number | null;
  monthlyDamagesCount: number | null;
  weeklyDamagesCount: number | null;
  totalHelpCount: number | null;
  monthlyHelpCount: number | null;
  weeklyHelpCount: number | null;
  payload: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickInt(value: unknown): number | null {
  const n = pickFiniteNumber(value);
  return n == null ? null : Math.trunc(n);
}

function parseRanking(raw: unknown): RankingStat {
  const obj = asRecord(raw) ?? {};
  return {
    value: pickFiniteNumber(obj.value),
    rank: pickInt(obj.rank),
    tier: typeof obj.tier === "string" ? obj.tier : null,
  };
}

const KNOWN_MU_KEYS = new Set([
  "_id",
  "id",
  "name",
  "user",
  "region",
  "country",
  "avatarUrl",
  "mercenaryReputation",
  "members",
  "roles",
  "leveling",
  "activeUpgradeLevels",
  "rankings",
  "createdAt",
  "updatedAt",
  "__v",
]);

export function parseMuById(raw: unknown): ParsedMu {
  const obj = asRecord(raw) ?? {};
  const id = pickString(obj, ["_id", "id", "muId"]);
  if (!id) throw new Error("mu.getById missing id");

  const membersRaw = obj.members;
  const memberUserIds = Array.isArray(membersRaw)
    ? membersRaw.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  const rankings = asRecord(obj.rankings) ?? {};
  const weekly = parseRanking(rankings.muWeeklyDamages);
  const bounty = parseRanking(rankings.muBounty);
  const reputation = parseRanking(rankings.muReputation);
  const damages = parseRanking(rankings.muDamages);
  const terrain = parseRanking(rankings.muTerrain);
  const wealth = parseRanking(rankings.muWealth);
  const leveling = asRecord(obj.leveling) ?? {};

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!KNOWN_MU_KEYS.has(k)) payload[k] = v;
  }

  const createdAt = pickString(obj, ["createdAt"]);
  return {
    id,
    name: pickString(obj, ["name"]),
    avatarUrl: pickString(obj, ["avatarUrl"]),
    countryId: pickString(obj, ["country", "countryId"]),
    regionId: pickString(obj, ["region", "regionId"]),
    ownerUserId: pickString(obj, ["user", "ownerUserId"]),
    mercenaryReputation: pickFiniteNumber(obj.mercenaryReputation),
    level: pickInt(leveling.level),
    createdAtGame: createdAt ? new Date(createdAt) : null,
    memberUserIds,
    roles: asRecord(obj.roles),
    activeUpgradeLevels: asRecord(obj.activeUpgradeLevels),
    payload: Object.keys(payload).length > 0 ? payload : null,
    stats: {
      weeklyDamages: weekly.value,
      weeklyDamagesRank: weekly.rank,
      weeklyDamagesTier: weekly.tier,
      bounty: bounty.value,
      bountyRank: bounty.rank,
      bountyTier: bounty.tier,
      reputation: reputation.value,
      reputationRank: reputation.rank,
      reputationTier: reputation.tier,
      damages: damages.value,
      damagesRank: damages.rank,
      damagesTier: damages.tier,
      terrain: terrain.value,
      terrainRank: terrain.rank,
      terrainTier: terrain.tier,
      wealth: wealth.value,
      wealthRank: wealth.rank,
      wealthTier: wealth.tier,
      levelingLevel: pickInt(leveling.level),
      levelingMonthlyDamages: pickFiniteNumber(leveling.monthlyDamages),
    },
  };
}

const KNOWN_MEMBER_KEYS = new Set([
  "_id",
  "id",
  "mu",
  "user",
  "totalDamagesCount",
  "monthlyDamagesCount",
  "weeklyDamagesCount",
  "totalHelpCount",
  "monthlyHelpCount",
  "weeklyHelpCount",
  "createdAt",
  "updatedAt",
  "__v",
]);

export function parseMuMembers(raw: unknown): ParsedMuMember[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ParsedMuMember[] = [];
  for (const item of list) {
    const obj = asRecord(item);
    if (!obj) continue;
    const muId = pickString(obj, ["mu", "muId"]);
    const userId = pickString(obj, ["user", "userId"]);
    if (!muId || !userId) continue;
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!KNOWN_MEMBER_KEYS.has(k)) payload[k] = v;
    }
    out.push({
      memberRowId: pickString(obj, ["_id", "id"]),
      muId,
      userId,
      totalDamagesCount: pickInt(obj.totalDamagesCount),
      monthlyDamagesCount: pickInt(obj.monthlyDamagesCount),
      weeklyDamagesCount: pickInt(obj.weeklyDamagesCount),
      totalHelpCount: pickInt(obj.totalHelpCount),
      monthlyHelpCount: pickInt(obj.monthlyHelpCount),
      weeklyHelpCount: pickInt(obj.weeklyHelpCount),
      payload: Object.keys(payload).length > 0 ? payload : null,
    });
  }
  return out;
}

export async function fetchMuById(warera: WareraRequester, muId: string): Promise<ParsedMu> {
  const json = await warera.request<unknown>(wareraProcedurePath("mu.getById", { muId }));
  return parseMuById(unwrapTrpcData(json));
}

/**
 * Live api2 procedure; not on official OpenAPI. Force api2 (same class as
 * company.getRecommendedRegionIdsByItemCode).
 */
export async function fetchMuMembersByMu(
  warera: WareraRequester,
  muId: string,
): Promise<ParsedMuMember[]> {
  const json = await warera.request<unknown>(wareraProcedurePath("muMember.getByMu", { muId }), {
    baseUrl: "https://api2.warera.io/trpc",
  });
  return parseMuMembers(unwrapTrpcData(json));
}

export function deriveMemberRole(
  userId: string,
  ownerUserId: string | null,
  roles: Record<string, unknown> | null,
): string {
  if (ownerUserId && userId === ownerUserId) return "owner";
  const managers = Array.isArray(roles?.managers) ? roles.managers : [];
  const commanders = Array.isArray(roles?.commanders) ? roles.commanders : [];
  if (managers.includes(userId)) return "manager";
  if (commanders.includes(userId)) return "commander";
  return "member";
}
```

Adjust the fetch test if `request` is called with one arg only — match whatever `WareraRequester` does (path + optional init). If the first test receives `undefined` as second arg, assert `toHaveBeenCalledWith(expect.stringContaining("mu.getById"))` only.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/warera/mu.test.ts`

Expected: PASS

- [ ] **Step 5: Update warera-api skill allowlist**

In `.agents/skills/warera-api/SKILL.md`, under the endpoint index / footnotes, add:

- `muMember` | `getByMu`††
- Footnote: †† Not on official OpenAPI; live api2 read used by MU stats poll — call api2 directly.

Also add `muMember.getByMu` to the prose near the recommended-regions override note.

- [ ] **Step 6: Commit**

```bash
git add src/warera/mu.ts src/warera/mu.test.ts .agents/skills/warera-api/SKILL.md
git commit -m "feat(warera): parse and fetch MU and muMember stats"
```

---

### Task 3: DB helpers for current MU + roster

**Files:**
- Create: `src/db/mus.ts`
- Create: `src/db/mus.test.ts`

**Interfaces:**
- Consumes: `mus`, `mu_members` schema; `SEED_MU_ID`, `ParsedMu`, `deriveMemberRole` from `src/warera/mu.ts`
- Produces:
  - `ensureSeedMu(db, now?): Promise<void>`
  - `listMusForSync(db): Promise<{ id: string }[]>`
  - `upsertMuCurrent(db, parsed: ParsedMu, fetchedAt: Date): Promise<void>`
  - `replaceMuMembers(db, muId, members: { userId: string; role: string }[], updatedAt: Date): Promise<void>`
  - `listMuMembers(db, muId): Promise<{ userId: string; role: string | null }[]>`

- [ ] **Step 1: Write failing tests**

Create `src/db/mus.test.ts` with in-memory DDL matching schema (same pattern as `src/db/regions.test.ts`):

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
  ensureSeedMu,
  listMuMembers,
  listMusForSync,
  replaceMuMembers,
  upsertMuCurrent,
} from "./mus";
import { SEED_MU_ID, type ParsedMu } from "../warera/mu";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mus-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mus (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      avatar_url TEXT,
      country_id TEXT,
      region_id TEXT,
      owner_user_id TEXT,
      mercenary_reputation REAL,
      level INTEGER,
      created_at_game INTEGER,
      roles TEXT,
      active_upgrade_levels TEXT,
      payload TEXT,
      enqueued_at INTEGER NOT NULL,
      fetched_at INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE mu_members (
      mu_id TEXT NOT NULL REFERENCES mus(id),
      user_id TEXT NOT NULL,
      role TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (mu_id, user_id)
    )
  `);
  return drizzle(client, { schema });
}

function sampleMu(overrides: Partial<ParsedMu> = {}): ParsedMu {
  return {
    id: SEED_MU_ID,
    name: "Sweed Liberty",
    avatarUrl: null,
    countryId: "c1",
    regionId: "r1",
    ownerUserId: "owner1",
    mercenaryReputation: 1,
    level: 1,
    createdAtGame: new Date("2026-04-20T07:56:38.148Z"),
    memberUserIds: ["u1", "owner1"],
    roles: { managers: [], commanders: ["u1"] },
    activeUpgradeLevels: { headquarters: 4 },
    payload: null,
    stats: {
      weeklyDamages: 1,
      weeklyDamagesRank: 1,
      weeklyDamagesTier: "gold",
      bounty: 1,
      bountyRank: 1,
      bountyTier: "gold",
      reputation: 1,
      reputationRank: 1,
      reputationTier: "gold",
      damages: 1,
      damagesRank: 1,
      damagesTier: "gold",
      terrain: 1,
      terrainRank: 1,
      terrainTier: "gold",
      wealth: 1,
      wealthRank: 1,
      wealthTier: "gold",
      levelingLevel: 1,
      levelingMonthlyDamages: 0,
    },
    ...overrides,
  };
}

describe("mus db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("seeds watchlist when empty", async () => {
    expect(await listMusForSync(db)).toEqual([]);
    await ensureSeedMu(db, new Date("2026-08-03T00:00:00.000Z"));
    expect(await listMusForSync(db)).toEqual([{ id: SEED_MU_ID }]);
    await ensureSeedMu(db);
    expect(await listMusForSync(db)).toHaveLength(1);
  });

  it("upserts current MU and replaces roster", async () => {
    await ensureSeedMu(db);
    const t = new Date("2026-08-03T12:00:00.000Z");
    await upsertMuCurrent(db, sampleMu(), t);
    await replaceMuMembers(
      db,
      SEED_MU_ID,
      [
        { userId: "u1", role: "commander" },
        { userId: "owner1", role: "owner" },
      ],
      t,
    );
    expect(await listMuMembers(db, SEED_MU_ID)).toEqual([
      { userId: "owner1", role: "owner" },
      { userId: "u1", role: "commander" },
    ]);
    await replaceMuMembers(db, SEED_MU_ID, [{ userId: "u2", role: "member" }], t);
    expect(await listMuMembers(db, SEED_MU_ID)).toEqual([{ userId: "u2", role: "member" }]);
  });
});
```

Sort member list in `listMuMembers` by `userId` so assertions stay stable.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/db/mus.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `src/db/mus.ts`**

```ts
import { asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { muMembers, mus } from "./schema";
import { SEED_MU_ID, type ParsedMu } from "../warera/mu";

export async function ensureSeedMu(db: Db, now = new Date()): Promise<void> {
  const existing = await listMusForSync(db);
  if (existing.length > 0) return;
  await db.insert(mus).values({ id: SEED_MU_ID, enqueuedAt: now }).onConflictDoNothing();
}

export async function listMusForSync(db: Db): Promise<{ id: string }[]> {
  const rows = await db.select({ id: mus.id }).from(mus);
  return rows;
}

export async function upsertMuCurrent(
  db: Db,
  parsed: ParsedMu,
  fetchedAt: Date,
): Promise<void> {
  await db
    .insert(mus)
    .values({
      id: parsed.id,
      name: parsed.name,
      avatarUrl: parsed.avatarUrl,
      countryId: parsed.countryId,
      regionId: parsed.regionId,
      ownerUserId: parsed.ownerUserId,
      mercenaryReputation: parsed.mercenaryReputation,
      level: parsed.level,
      createdAtGame: parsed.createdAtGame,
      roles: parsed.roles,
      activeUpgradeLevels: parsed.activeUpgradeLevels,
      payload: parsed.payload,
      enqueuedAt: fetchedAt,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: mus.id,
      set: {
        name: parsed.name,
        avatarUrl: parsed.avatarUrl,
        countryId: parsed.countryId,
        regionId: parsed.regionId,
        ownerUserId: parsed.ownerUserId,
        mercenaryReputation: parsed.mercenaryReputation,
        level: parsed.level,
        createdAtGame: parsed.createdAtGame,
        roles: parsed.roles,
        activeUpgradeLevels: parsed.activeUpgradeLevels,
        payload: parsed.payload,
        fetchedAt,
      },
    });
}

export async function replaceMuMembers(
  db: Db,
  muId: string,
  members: { userId: string; role: string }[],
  updatedAt: Date,
): Promise<void> {
  await db.delete(muMembers).where(eq(muMembers.muId, muId));
  if (members.length === 0) return;
  await db.insert(muMembers).values(
    members.map((m) => ({
      muId,
      userId: m.userId,
      role: m.role,
      updatedAt,
    })),
  );
}

export async function listMuMembers(
  db: Db,
  muId: string,
): Promise<{ userId: string; role: string | null }[]> {
  const rows = await db
    .select({ userId: muMembers.userId, role: muMembers.role })
    .from(muMembers)
    .where(eq(muMembers.muId, muId))
    .orderBy(asc(muMembers.userId));
  return rows.map((r) => ({ userId: r.userId, role: r.role ?? null }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/db/mus.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/mus.ts src/db/mus.test.ts
git commit -m "feat(db): MU watchlist upsert and roster sync helpers"
```

---

### Task 4: DB helpers for polls + snapshots

**Files:**
- Create: `src/db/mu-stats.ts`
- Create: `src/db/mu-stats.test.ts`

**Interfaces:**
- Consumes: `muPolls`, `muStatSnapshots`, `muMemberStatSnapshots`
- Produces:
  - `insertMuPoll(db, values): Promise<number>`
  - `insertMuStatSnapshots(db, pollId, rows: MuStatSnapshotRow[]): Promise<void>`
  - `insertMuMemberStatSnapshots(db, pollId, rows: MuMemberStatSnapshotRow[]): Promise<void>`
  - types `MuStatSnapshotRow`, `MuMemberStatSnapshotRow`

- [ ] **Step 1: Write failing tests**

Create `src/db/mu-stats.test.ts`:

```ts
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import {
  insertMuMemberStatSnapshots,
  insertMuPoll,
  insertMuStatSnapshots,
} from "./mu-stats";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mu-stats-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mu_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      mu_count INTEGER NOT NULL DEFAULT 0,
      member_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE mu_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      weekly_damages REAL,
      weekly_damages_rank INTEGER,
      weekly_damages_tier TEXT,
      bounty REAL,
      bounty_rank INTEGER,
      bounty_tier TEXT,
      reputation REAL,
      reputation_rank INTEGER,
      reputation_tier TEXT,
      damages REAL,
      damages_rank INTEGER,
      damages_tier TEXT,
      terrain REAL,
      terrain_rank INTEGER,
      terrain_tier TEXT,
      wealth REAL,
      wealth_rank INTEGER,
      wealth_tier TEXT,
      leveling_level INTEGER,
      leveling_monthly_damages REAL,
      payload TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE mu_member_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_row_id TEXT,
      total_damages_count INTEGER,
      monthly_damages_count INTEGER,
      weekly_damages_count INTEGER,
      total_help_count INTEGER,
      monthly_help_count INTEGER,
      weekly_help_count INTEGER,
      payload TEXT
    )
  `);
  return drizzle(client, { schema });
}

describe("mu-stats db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("inserts poll and snapshots", async () => {
    const pollId = await insertMuPoll(db, {
      recordedAt: new Date("2026-08-03T12:00:00.000Z"),
      status: "success",
      error: null,
      muCount: 1,
      memberCount: 1,
    });
    await insertMuStatSnapshots(db, pollId, [
      {
        muId: "mu1",
        weeklyDamages: 10,
        weeklyDamagesRank: 1,
        weeklyDamagesTier: "gold",
        bounty: null,
        bountyRank: null,
        bountyTier: null,
        reputation: null,
        reputationRank: null,
        reputationTier: null,
        damages: 100,
        damagesRank: 2,
        damagesTier: "platinum",
        terrain: null,
        terrainRank: null,
        terrainTier: null,
        wealth: null,
        wealthRank: null,
        wealthTier: null,
        levelingLevel: 1,
        levelingMonthlyDamages: 0,
        payload: null,
      },
    ]);
    await insertMuMemberStatSnapshots(db, pollId, [
      {
        muId: "mu1",
        userId: "u1",
        memberRowId: "row1",
        totalDamagesCount: 5,
        monthlyDamagesCount: 1,
        weeklyDamagesCount: 0,
        totalHelpCount: 2,
        monthlyHelpCount: 0,
        weeklyHelpCount: 0,
        payload: null,
      },
    ]);
    expect(pollId).toBeGreaterThan(0);
    const muSnaps = await db
      .select()
      .from(schema.muStatSnapshots)
      .where(eq(schema.muStatSnapshots.pollId, pollId));
    expect(muSnaps).toHaveLength(1);
    expect(muSnaps[0]?.damages).toBe(100);
    const memberSnaps = await db
      .select()
      .from(schema.muMemberStatSnapshots)
      .where(eq(schema.muMemberStatSnapshots.pollId, pollId));
    expect(memberSnaps).toHaveLength(1);
    expect(memberSnaps[0]?.totalDamagesCount).toBe(5);
  });

  it("no-ops on empty snapshot arrays", async () => {
    const pollId = await insertMuPoll(db, {
      recordedAt: new Date("2026-08-03T12:00:00.000Z"),
      status: "error",
      error: "none",
      muCount: 0,
      memberCount: 0,
    });
    await insertMuStatSnapshots(db, pollId, []);
    await insertMuMemberStatSnapshots(db, pollId, []);
    expect(pollId).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/db/mu-stats.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `src/db/mu-stats.ts`**

```ts
import type { Db } from "./client";
import { muMemberStatSnapshots, muPolls, muStatSnapshots } from "./schema";

export type MuStatSnapshotRow = {
  muId: string;
  weeklyDamages: number | null;
  weeklyDamagesRank: number | null;
  weeklyDamagesTier: string | null;
  bounty: number | null;
  bountyRank: number | null;
  bountyTier: string | null;
  reputation: number | null;
  reputationRank: number | null;
  reputationTier: string | null;
  damages: number | null;
  damagesRank: number | null;
  damagesTier: string | null;
  terrain: number | null;
  terrainRank: number | null;
  terrainTier: string | null;
  wealth: number | null;
  wealthRank: number | null;
  wealthTier: string | null;
  levelingLevel: number | null;
  levelingMonthlyDamages: number | null;
  payload: Record<string, unknown> | null;
};

export type MuMemberStatSnapshotRow = {
  muId: string;
  userId: string;
  memberRowId: string | null;
  totalDamagesCount: number | null;
  monthlyDamagesCount: number | null;
  weeklyDamagesCount: number | null;
  totalHelpCount: number | null;
  monthlyHelpCount: number | null;
  weeklyHelpCount: number | null;
  payload: Record<string, unknown> | null;
};

export async function insertMuPoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: string;
    error?: string | null;
    muCount: number;
    memberCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(muPolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      muCount: values.muCount,
      memberCount: values.memberCount,
    })
    .returning({ id: muPolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert mu_polls row");
  return id;
}

export async function insertMuStatSnapshots(
  db: Db,
  pollId: number,
  rows: MuStatSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(muStatSnapshots).values(
    rows.map((row) => ({
      pollId,
      muId: row.muId,
      weeklyDamages: row.weeklyDamages,
      weeklyDamagesRank: row.weeklyDamagesRank,
      weeklyDamagesTier: row.weeklyDamagesTier,
      bounty: row.bounty,
      bountyRank: row.bountyRank,
      bountyTier: row.bountyTier,
      reputation: row.reputation,
      reputationRank: row.reputationRank,
      reputationTier: row.reputationTier,
      damages: row.damages,
      damagesRank: row.damagesRank,
      damagesTier: row.damagesTier,
      terrain: row.terrain,
      terrainRank: row.terrainRank,
      terrainTier: row.terrainTier,
      wealth: row.wealth,
      wealthRank: row.wealthRank,
      wealthTier: row.wealthTier,
      levelingLevel: row.levelingLevel,
      levelingMonthlyDamages: row.levelingMonthlyDamages,
      payload: row.payload,
    })),
  );
}

export async function insertMuMemberStatSnapshots(
  db: Db,
  pollId: number,
  rows: MuMemberStatSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(muMemberStatSnapshots).values(
    rows.map((row) => ({
      pollId,
      muId: row.muId,
      userId: row.userId,
      memberRowId: row.memberRowId,
      totalDamagesCount: row.totalDamagesCount,
      monthlyDamagesCount: row.monthlyDamagesCount,
      weeklyDamagesCount: row.weeklyDamagesCount,
      totalHelpCount: row.totalHelpCount,
      monthlyHelpCount: row.monthlyHelpCount,
      weeklyHelpCount: row.weeklyHelpCount,
      payload: row.payload,
    })),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/db/mu-stats.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/mu-stats.ts src/db/mu-stats.test.ts
git commit -m "feat(db): MU poll and stats snapshot writers"
```

---

### Task 5: Job `mu-stats-poll` + registry

**Files:**
- Create: `src/jobs/mu-stats-poll/run.ts`
- Create: `src/jobs/mu-stats-poll/index.ts`
- Create: `src/jobs/mu-stats-poll/run.test.ts`
- Modify: `src/jobs/registry.ts`
- Modify: `AGENTS.md` (optional one-liner under jobs / Geo mentioning `mu-stats-poll`)

**Interfaces:**
- Consumes: all helpers from Tasks 2–4; `Logger`; `WareraRequester`
- Produces: `runMuStatsPoll(options): Promise<{ pollId: number; muCount: number; memberCount: number; status: "success" | "partial" | "error" }>`
- Produces: `muStatsPollJob: JobDefinition`

- [ ] **Step 1: Write failing job test**

Create `src/jobs/mu-stats-poll/run.test.ts`. Use the same in-memory DDL as Tasks 3–4 combined (all five MU tables). Mock `warera.request` by inspecting the path string (`includes("mu.getById")` / `includes("muMember.getByMu")`) because these calls use GET + `input=` in the path.

```ts
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { listMuMembers } from "../../db/mus";
import * as schema from "../../db/schema";
import { SEED_MU_ID } from "../../warera/mu";
import { runMuStatsPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "mu-poll-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE mus (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      avatar_url TEXT,
      country_id TEXT,
      region_id TEXT,
      owner_user_id TEXT,
      mercenary_reputation REAL,
      level INTEGER,
      created_at_game INTEGER,
      roles TEXT,
      active_upgrade_levels TEXT,
      payload TEXT,
      enqueued_at INTEGER NOT NULL,
      fetched_at INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE mu_members (
      mu_id TEXT NOT NULL REFERENCES mus(id),
      user_id TEXT NOT NULL,
      role TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (mu_id, user_id)
    )
  `);
  await client.execute(`
    CREATE TABLE mu_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      mu_count INTEGER NOT NULL DEFAULT 0,
      member_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE mu_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      weekly_damages REAL,
      weekly_damages_rank INTEGER,
      weekly_damages_tier TEXT,
      bounty REAL,
      bounty_rank INTEGER,
      bounty_tier TEXT,
      reputation REAL,
      reputation_rank INTEGER,
      reputation_tier TEXT,
      damages REAL,
      damages_rank INTEGER,
      damages_tier TEXT,
      terrain REAL,
      terrain_rank INTEGER,
      terrain_tier TEXT,
      wealth REAL,
      wealth_rank INTEGER,
      wealth_tier TEXT,
      leveling_level INTEGER,
      leveling_monthly_damages REAL,
      payload TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE mu_member_stat_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES mu_polls(id),
      mu_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      member_row_id TEXT,
      total_damages_count INTEGER,
      monthly_damages_count INTEGER,
      weekly_damages_count INTEGER,
      total_help_count INTEGER,
      monthly_help_count INTEGER,
      weekly_help_count INTEGER,
      payload TEXT
    )
  `);
  return drizzle(client, { schema });
}

const muFixture = {
  _id: SEED_MU_ID,
  name: "Sweed Liberty",
  user: "owner1",
  region: "reg1",
  country: "cty1",
  members: ["u1", "owner1"],
  roles: { managers: [], commanders: ["u1"] },
  leveling: { level: 1, monthlyDamages: 10 },
  activeUpgradeLevels: { headquarters: 4 },
  rankings: {
    muWeeklyDamages: { value: 100, rank: 1, tier: "gold" },
    muBounty: { value: 2, rank: 2, tier: "silver" },
    muReputation: { value: 1, rank: 3, tier: "gold" },
    muDamages: { value: 999, rank: 4, tier: "platinum" },
    muTerrain: { value: 50, rank: 5, tier: "gold" },
    muWealth: { value: 7, rank: 6, tier: "platinum" },
  },
  createdAt: "2026-04-20T07:56:38.148Z",
};

const memberFixture = [
  {
    _id: "row1",
    mu: SEED_MU_ID,
    user: "u1",
    totalDamagesCount: 10,
    monthlyDamagesCount: 2,
    weeklyDamagesCount: 1,
    totalHelpCount: 3,
    monthlyHelpCount: 1,
    weeklyHelpCount: 0,
  },
];

describe("runMuStatsPoll", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("seeds watchlist, upserts current rows, and writes snapshots", async () => {
    const warera = {
      request: vi.fn(async (path: string) => {
        if (path.includes("muMember.getByMu")) {
          return { result: { data: memberFixture } };
        }
        if (path.includes("mu.getById")) {
          return { result: { data: muFixture } };
        }
        throw new Error(`unexpected path ${path}`);
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
    const result = await runMuStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("success");
    expect(result.muCount).toBe(1);
    expect(result.memberCount).toBe(1);
    const muRow = await db.select().from(schema.mus).where(eq(schema.mus.id, SEED_MU_ID));
    expect(muRow[0]?.name).toBe("Sweed Liberty");
    expect(await listMuMembers(db, SEED_MU_ID)).toHaveLength(2);
    const polls = await db.select().from(schema.muPolls);
    expect(polls).toHaveLength(1);
    expect(polls[0]?.status).toBe("success");
  });

  it("marks partial when member fetch fails but still writes MU snapshot", async () => {
    const warera = {
      request: vi.fn(async (path: string) => {
        if (path.includes("muMember.getByMu")) throw new Error("members down");
        if (path.includes("mu.getById")) return { result: { data: muFixture } };
        throw new Error(`unexpected path ${path}`);
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
    const result = await runMuStatsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("partial");
    expect(result.muCount).toBe(1);
    expect(result.memberCount).toBe(0);
    const muRow = await db.select().from(schema.mus).where(eq(schema.mus.id, SEED_MU_ID));
    expect(muRow[0]?.name).toBe("Sweed Liberty");
    const memberSnaps = await db.select().from(schema.muMemberStatSnapshots);
    expect(memberSnaps).toHaveLength(0);
    const muSnaps = await db.select().from(schema.muStatSnapshots);
    expect(muSnaps).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/jobs/mu-stats-poll/run.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `run.ts`**

```ts
import type { Db } from "../../db/client";
import {
  ensureSeedMu,
  listMusForSync,
  replaceMuMembers,
  upsertMuCurrent,
} from "../../db/mus";
import {
  insertMuMemberStatSnapshots,
  insertMuPoll,
  insertMuStatSnapshots,
  type MuMemberStatSnapshotRow,
  type MuStatSnapshotRow,
} from "../../db/mu-stats";
import type { Logger } from "../../logging/logger";
import {
  deriveMemberRole,
  fetchMuById,
  fetchMuMembersByMu,
  type ParsedMu,
} from "../../warera/mu";
import type { WareraRequester } from "../../warera/prices";

function statsToRow(mu: ParsedMu): MuStatSnapshotRow {
  const s = mu.stats;
  return {
    muId: mu.id,
    weeklyDamages: s.weeklyDamages,
    weeklyDamagesRank: s.weeklyDamagesRank,
    weeklyDamagesTier: s.weeklyDamagesTier,
    bounty: s.bounty,
    bountyRank: s.bountyRank,
    bountyTier: s.bountyTier,
    reputation: s.reputation,
    reputationRank: s.reputationRank,
    reputationTier: s.reputationTier,
    damages: s.damages,
    damagesRank: s.damagesRank,
    damagesTier: s.damagesTier,
    terrain: s.terrain,
    terrainRank: s.terrainRank,
    terrainTier: s.terrainTier,
    wealth: s.wealth,
    wealthRank: s.wealthRank,
    wealthTier: s.wealthTier,
    levelingLevel: s.levelingLevel,
    levelingMonthlyDamages: s.levelingMonthlyDamages,
    payload: null,
  };
}

export async function runMuStatsPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
}): Promise<{
  pollId: number;
  muCount: number;
  memberCount: number;
  status: "success" | "partial" | "error";
}> {
  const { db, warera, logger } = options;
  const recordedAt = new Date();

  await ensureSeedMu(db, recordedAt);
  const watchlist = await listMusForSync(db);

  const muRows: MuStatSnapshotRow[] = [];
  const memberRows: MuMemberStatSnapshotRow[] = [];
  const errors: string[] = [];
  let fullSuccesses = 0;

  for (const { id: muId } of watchlist) {
    try {
      const mu = await fetchMuById(warera, muId);
      await upsertMuCurrent(db, mu, recordedAt);
      await replaceMuMembers(
        db,
        mu.id,
        mu.memberUserIds.map((userId) => ({
          userId,
          role: deriveMemberRole(userId, mu.ownerUserId, mu.roles),
        })),
        recordedAt,
      );

      muRows.push(statsToRow(mu));

      try {
        const members = await fetchMuMembersByMu(warera, muId);
        for (const m of members) {
          memberRows.push({
            muId: m.muId,
            userId: m.userId,
            memberRowId: m.memberRowId,
            totalDamagesCount: m.totalDamagesCount,
            monthlyDamagesCount: m.monthlyDamagesCount,
            weeklyDamagesCount: m.weeklyDamagesCount,
            totalHelpCount: m.totalHelpCount,
            monthlyHelpCount: m.monthlyHelpCount,
            weeklyHelpCount: m.weeklyHelpCount,
            payload: m.payload,
          });
        }
        fullSuccesses += 1;
      } catch (err) {
        errors.push(
          `muMember ${muId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        logger.warn(
          { muId, err: err instanceof Error ? err.message : String(err) },
          "mu member stats fetch failed",
        );
      }
    } catch (err) {
      errors.push(`mu ${muId}: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn(
        { muId, err: err instanceof Error ? err.message : String(err) },
        "mu getById failed",
      );
    }
  }

  const status =
    muRows.length === 0
      ? "error"
      : errors.length > 0 || fullSuccesses < watchlist.length
        ? "partial"
        : "success";

  const pollId = await insertMuPoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
    muCount: muRows.length,
    memberCount: memberRows.length,
  });
  await insertMuStatSnapshots(db, pollId, muRows);
  await insertMuMemberStatSnapshots(db, pollId, memberRows);

  logger.info(
    { pollId, muCount: muRows.length, memberCount: memberRows.length, status, errors: errors.length },
    "mu stats poll complete",
  );

  return { pollId, muCount: muRows.length, memberCount: memberRows.length, status };
}
```

- [ ] **Step 4: Implement `index.ts` and register**

```ts
import type { JobDefinition } from "../types";
import { runMuStatsPoll } from "./run";

export const muStatsPollJob: JobDefinition = {
  id: "mu-stats-poll",
  name: "MU Stats Poll",
  description:
    "Fetches mu.getById + muMember.getByMu for watchlist MUs; upserts current roster and appends stat snapshots",
  defaultCron: "0 */30 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runMuStatsPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.muCount} MUs, ${result.memberCount} members (${result.status})`;
  },
};
```

In `src/jobs/registry.ts`, import and add `muStatsPollJob` to `listJobDefinitions()`.

- [ ] **Step 5: Run job tests**

Run: `vp test src/jobs/mu-stats-poll/run.test.ts`

Expected: PASS

- [ ] **Step 6: Run broader check**

Run: `vp check` and `vp test src/warera/mu.test.ts src/db/mus.test.ts src/db/mu-stats.test.ts src/jobs/mu-stats-poll/run.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/jobs/mu-stats-poll src/jobs/registry.ts AGENTS.md
git commit -m "feat(jobs): add mu-stats-poll every 30 minutes"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `mus` / `mu_members` current tables | 1, 3 |
| `mu_polls` + typed snapshots | 1, 4 |
| Seed MU id | 2 (`SEED_MU_ID`), 3, 5 |
| 30m cron job | 5 |
| `mu.getById` + `muMember.getByMu` api2 | 2 |
| Partial failure semantics | 5 |
| No UI | — (omitted) |
| Skill allowlist note | 2 |
| Keep forever / no prune | — (omitted) |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-mu-stats-poll.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
