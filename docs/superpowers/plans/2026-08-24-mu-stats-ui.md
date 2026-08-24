# MU Stats UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/mu` search + `/mu/$muId` detail with current MU/roster view and TanStack Charts over existing `mu_stat_snapshots` / `mu_member_stat_snapshots`, including rolling and Monday-UTC week ranges.

**Architecture:** Market-style split APIs — `GET /api/mu/:id` (warm DB / cold live-fill + `insertMuWatchReason(manual)`, no snapshots) and `GET /api/mu/:id/history` (DB-only). Web: search landing + stacked detail (header → current strip → MU chart → members chart + roster). Reuse economy MU search and Follow watch enqueue patterns.

**Tech Stack:** Hono, Drizzle/libSQL, TanStack Router + Charts, Vitest via `vp test`, Vite+ (`vp check`).

**Design:** [2026-08-24-mu-stats-ui-design.md](../specs/2026-08-24-mu-stats-ui-design.md)

## Global Constraints

- Prefer existing DB; WarEra only for search + cold `fetchMuById` / `fetchMuMembersByMu`
- Cold open: upsert current + manual watch; **never** insert `mu_polls` / snapshots
- History ranges: `24h` | `7d` | `30d` | `all` | `this_week` | `last_week` (Mon 00:00 UTC)
- Chart metric keys = Drizzle field names (see allowlists below)
- Member labels: local `players.username` when present; else truncated `userId`
- No custom date picker; no tabbed charts; no live username resolve for all members
- Prefer `vp test path/to/file.test.ts` while iterating; `vp check` before task done
- Commit after each task
- Update `docs/warera-api/inventory.md` MU consumer row when APIs land

### Metric allowlists (schema truth)

**MU (`muStatSnapshots`):**  
`weeklyDamages`, `bounty`, `reputation`, `damages`, `terrain`, `wealth`, `levelingLevel`, `levelingMonthlyDamages`

**Members (`muMemberStatSnapshots`):**  
`totalDamagesCount`, `monthlyDamagesCount`, `weeklyDamagesCount`, `totalHelpCount`, `monthlyHelpCount`, `weeklyHelpCount`

Defaults: MU `weeklyDamages`; members `weeklyDamagesCount`.

### Existing helpers to reuse (do not reinvent)

| Need | Use |
| --- | --- |
| Live MU | `fetchMuById`, `fetchMuMembersByMu`, `deriveMemberRole` from `src/warera/mu.ts` |
| Upsert current | `upsertMuCurrent`, `replaceMuMembers`, `listMuMembers` from `src/db/mus.ts` |
| Watch | `insertMuWatchReason`, `WATCH_REASON_MANUAL`, `MANUAL_SOURCE_ID` from `src/db/watch-reasons.ts` |
| Search | `GET /api/economy/search?q=&type=mu` + `IdSearchField` pattern |
| Charts | `@tanstack/charts` + `@tanstack/react-charts` like `MarketPriceChart` |
| HTTP errors | `HttpError` from server routes |

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/mu/ranges.ts` | Parse MU history ranges; resolve `[from, to]` including week bounds |
| `src/mu/ranges.test.ts` | Range parse + week boundary tests (fixed `now`) |
| `src/mu/metrics.ts` | Allowlists + type guards for MU/member metric keys |
| `src/mu/metrics.test.ts` | Allowlist rejection/acceptance |
| `src/db/mu-history.ts` | Read latest MU/member stats + time series for a range/metric |
| `src/db/mu-history.test.ts` | History queries against in-memory schema |
| `src/server/routes/mu.ts` | `GET /:id`, `GET /:id/history` |
| `src/server/routes/mu.test.ts` | Warm/cold current + history API tests |
| `src/server/app.ts` | Mount `/api/mu` |
| `src/web/lib/muSearch.ts` | `validateSearch` for detail query (`range`, `muMetric`, `memberMetric`) |
| `src/web/features/mu/types.ts` | DTOs |
| `src/web/features/mu/MuSearchPage.tsx` | `/mu` landing |
| `src/web/features/mu/MuDetailPage.tsx` | Stacked detail |
| `src/web/features/mu/MuHistoryChart.tsx` | Single-series MU chart |
| `src/web/features/mu/MuMemberHistoryChart.tsx` | Multi-series members chart |
| `src/web/features/mu/MuRosterTable.tsx` | Sortable roster |
| `src/web/routes/mu.tsx` | `/mu` |
| `src/web/routes/mu_.$muId.tsx` | `/mu/$muId` |
| `src/web/layout/Shell.tsx` | Add MU nav tab |
| `docs/warera-api/inventory.md` | Note MU UI as consumer |

---

### Task 1: History ranges + metric allowlists

**Files:**
- Create: `src/mu/ranges.ts`, `src/mu/ranges.test.ts`
- Create: `src/mu/metrics.ts`, `src/mu/metrics.test.ts`

**Interfaces:**
- Produces: `MuHistoryRange`, `parseMuHistoryRange`, `resolveMuHistoryWindow(range, now) → { from: Date | null; to: Date }`
- Produces: `MU_HISTORY_METRICS`, `MEMBER_HISTORY_METRICS`, `isMuHistoryMetric`, `isMemberHistoryMetric`

- [ ] **Step 1: Write failing range tests**

```ts
// src/mu/ranges.test.ts
import { describe, expect, it } from "vitest";
import { parseMuHistoryRange, resolveMuHistoryWindow } from "./ranges";

describe("parseMuHistoryRange", () => {
  it("accepts known ranges and defaults to 7d", () => {
    expect(parseMuHistoryRange("24h")).toBe("24h");
    expect(parseMuHistoryRange("this_week")).toBe("this_week");
    expect(parseMuHistoryRange("last_week")).toBe("last_week");
    expect(parseMuHistoryRange(undefined)).toBe("7d");
    expect(parseMuHistoryRange("nope")).toBe("7d");
  });
});

describe("resolveMuHistoryWindow", () => {
  // Thursday 2026-08-20 15:00:00 UTC
  const now = new Date("2026-08-20T15:00:00.000Z");

  it("resolves rolling 24h", () => {
    const w = resolveMuHistoryWindow("24h", now);
    expect(w.from?.toISOString()).toBe("2026-08-19T15:00:00.000Z");
    expect(w.to.toISOString()).toBe(now.toISOString());
  });

  it("resolves this_week Mon 00:00 UTC → now", () => {
    const w = resolveMuHistoryWindow("this_week", now);
    expect(w.from?.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(w.to.toISOString()).toBe(now.toISOString());
  });

  it("resolves last_week previous Mon → Sun end", () => {
    const w = resolveMuHistoryWindow("last_week", now);
    expect(w.from?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("resolves all with null from", () => {
    const w = resolveMuHistoryWindow("all", now);
    expect(w.from).toBeNull();
    expect(w.to.toISOString()).toBe(now.toISOString());
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `vp test src/mu/ranges.test.ts`  
Expected: FAIL cannot find module `./ranges`

- [ ] **Step 3: Implement ranges**

```ts
// src/mu/ranges.ts
export const MU_HISTORY_RANGES = [
  "24h",
  "7d",
  "30d",
  "all",
  "this_week",
  "last_week",
] as const;
export type MuHistoryRange = (typeof MU_HISTORY_RANGES)[number];

const ROLLING_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function parseMuHistoryRange(value: unknown): MuHistoryRange {
  if (typeof value === "string" && (MU_HISTORY_RANGES as readonly string[]).includes(value)) {
    return value as MuHistoryRange;
  }
  return "7d";
}

/** Monday 00:00:00.000 UTC containing or starting the week of `d`. */
export function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

export function resolveMuHistoryWindow(
  range: MuHistoryRange,
  now: Date = new Date(),
): { from: Date | null; to: Date } {
  if (range === "all") return { from: null, to: now };
  if (range === "this_week") return { from: startOfUtcWeek(now), to: now };
  if (range === "last_week") {
    const thisMon = startOfUtcWeek(now);
    const lastMon = new Date(thisMon);
    lastMon.setUTCDate(lastMon.getUTCDate() - 7);
    return { from: lastMon, to: thisMon };
  }
  return { from: new Date(now.getTime() - ROLLING_MS[range]), to: now };
}
```

- [ ] **Step 4: Write metric allowlist tests + implementation**

```ts
// src/mu/metrics.ts
export const MU_HISTORY_METRICS = [
  "weeklyDamages",
  "bounty",
  "reputation",
  "damages",
  "terrain",
  "wealth",
  "levelingLevel",
  "levelingMonthlyDamages",
] as const;
export type MuHistoryMetric = (typeof MU_HISTORY_METRICS)[number];

export const MEMBER_HISTORY_METRICS = [
  "totalDamagesCount",
  "monthlyDamagesCount",
  "weeklyDamagesCount",
  "totalHelpCount",
  "monthlyHelpCount",
  "weeklyHelpCount",
] as const;
export type MemberHistoryMetric = (typeof MEMBER_HISTORY_METRICS)[number];

export const DEFAULT_MU_METRIC: MuHistoryMetric = "weeklyDamages";
export const DEFAULT_MEMBER_METRIC: MemberHistoryMetric = "weeklyDamagesCount";

export function isMuHistoryMetric(v: unknown): v is MuHistoryMetric {
  return typeof v === "string" && (MU_HISTORY_METRICS as readonly string[]).includes(v);
}
export function isMemberHistoryMetric(v: unknown): v is MemberHistoryMetric {
  return typeof v === "string" && (MEMBER_HISTORY_METRICS as readonly string[]).includes(v);
}
```

Tests: valid keys true; unknown false; defaults exported.

- [ ] **Step 5: Run tests — expect PASS**

Run: `vp test src/mu/ranges.test.ts src/mu/metrics.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/mu/ranges.ts src/mu/ranges.test.ts src/mu/metrics.ts src/mu/metrics.test.ts
git commit -m "$(cat <<'EOF'
Add MU history range and metric allowlist helpers.

Support rolling windows plus Monday-UTC this/last week for chart queries.
EOF
)"
```

---

### Task 2: DB history readers

**Files:**
- Create: `src/db/mu-history.ts`, `src/db/mu-history.test.ts`
- Modify: reuse schema tables only (no migration)

**Interfaces:**
- Consumes: `resolveMuHistoryWindow`, metric types from Task 1
- Produces:
  - `getLatestMuStatSnapshot(db, muId)`
  - `getLatestMemberStatSnapshots(db, muId)` → map/list by userId
  - `getMuStatHistory(db, muId, metric, range, now?)` → `{ recordedAt: Date; value: number | null }[]`
  - `getMuMemberStatHistory(db, muId, metric, range, now?)` → `{ recordedAt: Date; userId: string; value: number | null }[]`
  - Join snapshots to `muPolls` on `pollId`; filter `muPolls.recordedAt`; prefer `status IN ('success','partial')` like price history

- [ ] **Step 1: Write failing history tests**

Follow `src/db/mu-stats.test.ts` / `src/db/price-history` patterns: in-memory client, `CREATE TABLE` for `mu_polls`, `mu_stat_snapshots`, `mu_member_stat_snapshots`, insert poll + snapshots at known timestamps, assert window filtering and metric column selection.

Include cases:
1. Rolling window excludes older points
2. `this_week` / `last_week` boundaries
3. `all` returns everything
4. Empty MU → empty arrays (not throw)
5. Member history returns one row per userId per poll

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/db/mu-history.test.ts`

- [ ] **Step 3: Implement `src/db/mu-history.ts`**

Sketch:

```ts
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { MuHistoryMetric, MemberHistoryMetric } from "../mu/metrics";
import { resolveMuHistoryWindow, type MuHistoryRange } from "../mu/ranges";
import type { Db } from "./client";
import { muMemberStatSnapshots, muPolls, muStatSnapshots } from "./schema";

const OK = ["success", "partial"] as const;

export async function getMuStatHistory(
  db: Db,
  muId: string,
  metric: MuHistoryMetric,
  range: MuHistoryRange,
  now: Date = new Date(),
): Promise<{ recordedAt: Date; value: number | null }[]> {
  const { from, to } = resolveMuHistoryWindow(range, now);
  const conds = [
    eq(muStatSnapshots.muId, muId),
    inArray(muPolls.status, [...OK]),
    lte(muPolls.recordedAt, to),
  ];
  if (from) conds.push(gte(muPolls.recordedAt, from));

  const rows = await db
    .select({
      recordedAt: muPolls.recordedAt,
      value: muStatSnapshots[metric],
    })
    .from(muStatSnapshots)
    .innerJoin(muPolls, eq(muStatSnapshots.pollId, muPolls.id))
    .where(and(...conds))
    .orderBy(asc(muPolls.recordedAt), asc(muPolls.id));

  return rows.map((r) => ({ recordedAt: r.recordedAt, value: r.value ?? null }));
}

// getMuMemberStatHistory: same join, select userId + muMemberStatSnapshots[metric]
// getLatest*: orderBy desc recordedAt limit 1 (MU) / distinct-on latest poll for members
```

For latest member stats: load newest successful poll that has member rows for `muId`, then all member snapshot rows for that `pollId` (simpler than per-user lateral).

- [ ] **Step 4: Run — expect PASS**

Run: `vp test src/db/mu-history.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/db/mu-history.ts src/db/mu-history.test.ts
git commit -m "$(cat <<'EOF'
Add DB readers for MU and member stat history.

Join snapshots to polls with range windows for chart APIs.
EOF
)"
```

---

### Task 3: `GET /api/mu/:id` (current + cold fill)

**Files:**
- Create: `src/server/routes/mu.ts`, `src/server/routes/mu.test.ts`
- Modify: `src/server/app.ts` (mount route; can mount with stub history 404 until Task 4, or add both handlers in this file and implement history in Task 4)

**Interfaces:**
- Produces route module `muRoutes({ db, warera, logger })`
- `GET /:id` response:

```ts
type MuCurrentResponse = {
  mu: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    countryId: string | null;
    regionId: string | null;
    level: number | null;
    mercenaryReputation: number | null;
    fetchedAt: string | null;
  };
  members: Array<{
    userId: string;
    role: string | null;
    username: string | null;
    latest: Partial<Record<MemberHistoryMetric, number | null>> | null;
  }>;
  latestMuStats: (Partial<Record<MuHistoryMetric, number | null>> & {
    weeklyDamagesRank?: number | null;
    // include rank/tier companions used by strip as needed
  }) | null;
  meta: {
    watched: boolean;
    historyAvailable: boolean;
    liveFilled: boolean;
  };
};
```

**Cold path algorithm (must match design):**

1. Try DB `mus` by id.
2. If missing (or optionally always refresh when `?refresh=1` — **v1: only live-fill when `mus` row missing**):
   - `fetchMuById(warera, id)` — on fail map to 404/502 via existing follow `mapLookupError` pattern; **do not** enqueue
   - `upsertMuCurrent(db, parsed, now)`
   - `replaceMuMembers` from `parsed.memberUserIds` + `deriveMemberRole`
   - Try `fetchMuMembersByMu` — use counters **in the HTTP response only**; do **not** write snapshots. If this fails, still continue.
   - `insertMuWatchReason({ muId, reason: WATCH_REASON_MANUAL, sourceId: MANUAL_SOURCE_ID, at: now })`
   - Set `meta.liveFilled = true`
3. Warm assembly: `mus` + `listMuMembers` + usernames from `players` (`inArray`) + `getLatestMuStatSnapshot` / `getLatestMemberStatSnapshots`
4. `meta.watched` = exists row in `muWatchReasons` for id; `historyAvailable` = any mu snapshot for id

- [ ] **Step 1: Write failing API tests**

Cases:
1. Warm: seed `mus` + members + snapshot + player username → 200, `liveFilled: false`, username present, no warera call
2. Cold: empty DB, mock `fetchMuById` + `fetchMuMembersByMu` → 200, mus upserted, manual watch reason inserted, **zero** `mu_polls` / snapshot rows
3. Cold getById throws not found → 404, no watch reason
4. Unknown metric N/A here

Mirror `follow.test.ts` temp DB + mocked requester; mount only `muRoutes`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `GET /:id` in `muRoutes`**

Reuse follow cold-MU structure from `src/server/routes/follow.ts` but add `fetchMuMembersByMu` for response counters and `replaceMuMembers`.

- [ ] **Step 4: Mount in `src/server/app.ts`**

```ts
app.route("/api/mu", muRoutes({ db: deps.db, warera: deps.warera, logger: deps.logger }));
```

- [ ] **Step 5: Tests PASS + commit**

```bash
git add src/server/routes/mu.ts src/server/routes/mu.test.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
Add GET /api/mu/:id with cold live-fill and manual watch enqueue.

Upsert current MU/roster without writing history snapshots.
EOF
)"
```

---

### Task 4: `GET /api/mu/:id/history`

**Files:**
- Modify: `src/server/routes/mu.ts`, `src/server/routes/mu.test.ts`

**Interfaces:**
- Query: `range`, `scope=mu|members`, `metric`
- Invalid metric → 400 `bad_request`
- MU missing entirely (no `mus` row and no live attempt on history) → 404
- Empty points → 200 `{ range, scope, metric, points: [] }`

Response shapes:

```ts
// scope=mu
{ range, scope: "mu", metric, points: { recordedAt: string; value: number | null }[] }

// scope=members
{
  range,
  scope: "members",
  metric,
  series: { userId: string; label: string; points: { recordedAt: string; value: number | null }[] }[]
}
```

Server groups flat member history rows into `series[]` and attaches labels via `players.username` (fallback truncate id to 8 chars).

- [ ] **Step 1: Failing tests** for allowlist 400, empty 200, mu points ISO dates, members series grouping, week range wiring

- [ ] **Step 2: Implement handler using Task 2 readers**

- [ ] **Step 3: PASS + commit**

```bash
git add src/server/routes/mu.ts src/server/routes/mu.test.ts
git commit -m "$(cat <<'EOF'
Add GET /api/mu/:id/history for MU and member chart series.

Enforce metric allowlists and calendar-week range resolution.
EOF
)"
```

---

### Task 5: Inventory + Shell nav stub routes

**Files:**
- Modify: `docs/warera-api/inventory.md` (MU row consumers → include MU UI / `/api/mu`)
- Modify: `src/web/layout/Shell.tsx` — add `{ to: "/mu", label: "MU" }` near Follow
- Create: `src/web/routes/mu.tsx`, `src/web/routes/mu_.$muId.tsx` (placeholder components OK if Task 6/7 follow immediately in same session — prefer real pages in Tasks 6–7; this task only nav + inventory if splitting)
- Create: `src/web/lib/muSearch.ts`

**Prefer folding nav into Task 6** if implementing continuously. If splitting:

- [ ] Update inventory MU consumers cell to mention `GET /api/mu/:id` (+ history) and MU tool page
- [ ] Add Shell tab
- [ ] Commit docs + nav only when pages exist (otherwise do Task 5 after Task 6)

**Skip standalone commit** — execute inventory + Shell updates at end of Task 6.

---

### Task 6: Search page `/mu`

**Files:**
- Create: `src/web/features/mu/types.ts`, `src/web/features/mu/MuSearchPage.tsx`
- Create: `src/web/routes/mu.tsx`
- Modify: `src/web/layout/Shell.tsx`

- [ ] **Step 1: Types**

```ts
export type MuSearchHit = { muId: string; name: string };
export type EconomyMuSearchResponse = { mus: MuSearchHit[] };
```

(Adjust field names to match actual `/api/economy/search?type=mu` JSON — inspect `economy.ts` / Follow types and copy exactly.)

- [ ] **Step 2: `MuSearchPage`**

- Heading + short blurb
- Reuse `IdSearchField` with `searchType="mu"` **or** inline the same fetch to `/api/economy/search?q=&type=mu`
- On submit / result click → `navigate({ to: "/mu/$muId", params: { muId } })`
- Optional: show watched badge later; v1 can skip badges

- [ ] **Step 3: Route + Shell**

```ts
// src/web/routes/mu.tsx
import { createFileRoute } from "@tanstack/react-router";
import { MuSearchPage } from "../features/mu/MuSearchPage";

export const Route = createFileRoute("/mu")({
  component: MuSearchPage,
});
```

Add Shell tab `{ to: "/mu", label: "MU" }`.

- [ ] **Step 4: Manual smoke** — `vp run dev`, open `/mu`, search, click through (detail may 404 until Task 7)

- [ ] **Step 5: `vp check` on touched files; commit**

```bash
git add src/web/features/mu/types.ts src/web/features/mu/MuSearchPage.tsx src/web/routes/mu.tsx src/web/layout/Shell.tsx docs/warera-api/inventory.md
git commit -m "$(cat <<'EOF'
Add MU search page and nav entry.

Reuse economy MU search to open unit detail routes.
EOF
)"
```

---

### Task 7: Detail page + charts

**Files:**
- Create: `src/web/lib/muSearch.ts`
- Create: `src/web/features/mu/MuDetailPage.tsx`
- Create: `src/web/features/mu/MuHistoryChart.tsx`
- Create: `src/web/features/mu/MuMemberHistoryChart.tsx`
- Create: `src/web/features/mu/MuRosterTable.tsx`
- Create: `src/web/routes/mu_.$muId.tsx`

**Search params** (`parseMuDetailSearch`):

```ts
import {
  DEFAULT_MEMBER_METRIC,
  DEFAULT_MU_METRIC,
  isMemberHistoryMetric,
  isMuHistoryMetric,
  type MemberHistoryMetric,
  type MuHistoryMetric,
} from "../../mu/metrics";
import { parseMuHistoryRange, type MuHistoryRange } from "../../mu/ranges";

export type MuDetailSearch = {
  range: MuHistoryRange;
  memberRange: MuHistoryRange; // independent ranges
  muMetric: MuHistoryMetric;
  memberMetric: MemberHistoryMetric;
};

export function parseMuDetailSearch(search: Record<string, unknown>): MuDetailSearch {
  return {
    range: parseMuHistoryRange(search.range),
    memberRange: parseMuHistoryRange(search.memberRange ?? search.range),
    muMetric: isMuHistoryMetric(search.muMetric) ? search.muMetric : DEFAULT_MU_METRIC,
    memberMetric: isMemberHistoryMetric(search.memberMetric)
      ? search.memberMetric
      : DEFAULT_MEMBER_METRIC,
  };
}
```

**`MuDetailPage` layout (stacked):**

1. Load `GET /api/mu/${muId}` on mount / muId change
2. Header + current strip chips (`weeklyDamages`, `bounty`, `reputation`, `wealth` from `latestMuStats`, else level / mercenaryReputation)
3. Empty-history callout when `!meta.historyAvailable`
4. MU chart block: metric `<select>` + range chips (`MU_HISTORY_RANGES`) → fetch `/api/mu/:id/history?scope=mu&range=&metric=`
5. Members chart block: independent metric + `memberRange` chips → `scope=members`
6. Roster table: members + latest value for `memberMetric`, sortable

**Charts:**

- `MuHistoryChart`: single `lineY` like Market (x=date, y=value)
- `MuMemberHistoryChart`: one `lineY` mark per series (cap 25); stable color by userId hash; empty state message when no points

Range chip labels: `24h`, `7d`, `30d`, `all`, `This week` (`this_week`), `Last week` (`last_week`).

- [ ] **Step 1: Wire route with `validateSearch`**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { MuDetailPage } from "../features/mu/MuDetailPage";
import { parseMuDetailSearch } from "../lib/muSearch";

export const Route = createFileRoute("/mu_/$muId")({
  validateSearch: (search: Record<string, unknown>) => parseMuDetailSearch(search),
  component: MuDetailPage,
});
```

- [ ] **Step 2: Implement page + charts + roster**

Keep components focused; mirror MarketItemPage navigation for search updates (`navigate({ search: { ... }, replace: true })`).

- [ ] **Step 3: Smoke manually** — warm watched MU with history; cold id shows identity + empty charts message

- [ ] **Step 4: `vp check` + commit**

```bash
git add src/web/lib/muSearch.ts src/web/features/mu src/web/routes/mu_.\$muId.tsx
git commit -m "$(cat <<'EOF'
Add MU detail page with current stats and history charts.

Stacked MU and member series with independent range and metric controls.
EOF
)"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run focused tests**

```bash
vp test src/mu/ranges.test.ts src/mu/metrics.test.ts src/db/mu-history.test.ts src/server/routes/mu.test.ts
```

Expected: PASS

- [ ] **Step 2: `vp check`**

Expected: PASS (or fix any format/lint issues from new files)

- [ ] **Step 3: Confirm inventory MU row mentions UI consumers**

- [ ] **Step 4: If anything uncommitted, commit**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Search any MU via economy search | 6 |
| Detail stacked layout | 7 |
| Cold live-fill + manual watch, no snapshot | 3 |
| History DB-only with metric pickers | 2, 4, 7 |
| Rolling + this/last week UTC | 1, 4, 7 |
| All snapshotted metrics | 1 allowlists + 7 selects |
| All members ≤25 series + best-effort names | 4 labels + 7 chart |
| Independent chart ranges | 7 `range` / `memberRange` |
| Nav tab | 6 |
| Inventory update | 6/8 |
| No first snapshot / no username fanout / no date picker | Constraints + Task 3 |

**Placeholder scan:** none intentional.  
**Type consistency:** metric unions and range unions shared from `src/mu/*` into DB, API, and web search params.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-24-mu-stats-ui.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
