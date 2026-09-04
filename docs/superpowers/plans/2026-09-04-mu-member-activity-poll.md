# MU Member Activity Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-minute Croner job that batch-fetches `user.getUserById` for all members of watched MUs, appends typed activity/identity snapshots, and makes existing identity lookups DB-first with live API fallback.

**Architecture:** Snapshots-only (no dual-write current table). `mu-member-poll` is the sole writer. `getLatestUserProfile` + `resolveUserByIdRef` read latest row (optional `maxAgeMs`); miss/stale → live `fetchUserById` without inserting. Migrate `syncFollowedPlayers`, follow add, and `resolveJobWage`.

**Tech Stack:** TypeScript, Drizzle/Turso (libsql), Croner jobs, Vitest via `vp test`, Vite+ (`vp check` / `vp run db:generate`).

**Design:** [2026-09-04-mu-member-activity-poll-design.md](../specs/2026-09-04-mu-member-activity-poll-design.md)

## Global Constraints

- No UI, charts, or new Hono read routes in this slice
- Roster source: watched MUs (`mu_watch_reasons`) → distinct `mu_members.user_id`
- Upstream: `user.getUserById` only (batched); never `getUserLite` in this job
- Snapshots only — poll is the sole snapshot writer; demand fallback must not insert
- Typed tier-A columns only — no JSON `payload` for leftovers in v1
- Cadence: `0 */5 * * * *`, default enabled
- Job-default freshness: `maxAgeMs = 10 * 60 * 1000` (10 minutes)
- Retention: keep forever (no prune)
- Use existing `WareraRequester` / `requestBatch` — no parallel HTTP stack
- Prefer `vp test path/to/file.test.ts` and `vp check` for verification
- Commit after each task
- Update `docs/warera-api/inventory.md` in the job/register task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | `user_profile_polls`, `user_profile_snapshots` |
| `drizzle/0012_*.sql` (+ meta) | Migration via `vp run db:generate` |
| `src/warera/users.ts` | Add `ParsedUserProfile` + `parseUserProfile`; keep thin `UserByIdRef` / existing lite helpers |
| `src/warera/users.test.ts` | Parser tests for tier-A profile |
| `src/db/user-profiles.ts` | Insert poll/snapshots; `listDistinctWatchedMuMemberUserIds`; `getLatestUserProfile` |
| `src/db/user-profiles.test.ts` | Insert + latest query tests |
| `src/user/resolve-user-by-id.ts` | `resolveUserByIdRef` (DB-first → API) |
| `src/user/resolve-user-by-id.test.ts` | Miss / hit / stale / no-insert-on-fallback |
| `src/jobs/mu-member-poll/run.ts` | Job orchestration |
| `src/jobs/mu-member-poll/index.ts` | JobDefinition |
| `src/jobs/mu-member-poll/run.test.ts` | Mocked batch end-to-end |
| `src/jobs/registry.ts` | Register job |
| `src/jobs/sync-followed-players.ts` | DB-first resolve per followed id |
| `src/jobs/sync-followed-players.test.ts` | Snapshot hit skips WarEra |
| `src/server/routes/follow.ts` | Follow add uses `resolveUserByIdRef` |
| `src/skills/job-wage.ts` | Accept optional `db`; resolve company via helper |
| `src/user/build.ts` | Pass `db` into `resolveJobWage` |
| `docs/warera-api/inventory.md` | Catalog the new resource |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0012_*.sql` + `drizzle/meta/*` via generate

**Interfaces:**
- Consumes: existing drizzle sqlite patterns in `schema.ts`
- Produces: tables `user_profile_polls`, `user_profile_snapshots`

- [ ] **Step 1: Append tables to `src/db/schema.ts`**

Place near other poll tables (after MU member snapshots / near `players` is fine).

```ts
export const userProfilePolls = sqliteTable(
  "user_profile_polls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    error: text("error"),
    userCount: integer("user_count").notNull().default(0),
    muCount: integer("mu_count").notNull().default(0),
  },
  (t) => [index("user_profile_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const userProfileSnapshots = sqliteTable(
  "user_profile_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => userProfilePolls.id),
    userId: text("user_id").notNull(),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    countryId: text("country_id"),
    muId: text("mu_id"),
    companyId: text("company_id"),
    partyId: text("party_id"),
    isActive: integer("is_active", { mode: "boolean" }),
    lastConnectionAt: integer("last_connection_at", { mode: "timestamp_ms" }),
    lastWorkAt: integer("last_work_at", { mode: "timestamp_ms" }),
    lastHelpAskedAt: integer("last_help_asked_at", { mode: "timestamp_ms" }),
    lastDailyRewardClaimedAt: integer("last_daily_reward_claimed_at", {
      mode: "timestamp_ms",
    }),
    lastCompanyJoinedAt: integer("last_company_joined_at", { mode: "timestamp_ms" }),
    lastDailyCalendarClaimedAt: integer("last_daily_calendar_claimed_at", {
      mode: "timestamp_ms",
    }),
    lastSkillsResetAt: integer("last_skills_reset_at", { mode: "timestamp_ms" }),
    level: integer("level"),
    totalXp: integer("total_xp"),
    dailyXpLeft: integer("daily_xp_left"),
    availableSkillPoints: integer("available_skill_points"),
    spentSkillPoints: integer("spent_skill_points"),
    totalSkillPoints: integer("total_skill_points"),
    prestigeLevel: integer("prestige_level"),
    militaryRank: integer("military_rank"),
    isPremium: integer("is_premium", { mode: "boolean" }),
    premiumMonthsCount: integer("premium_months_count"),
    createdAtGame: integer("created_at_game", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("user_profile_snapshots_user_recorded_at_idx").on(t.userId, t.recordedAt),
    index("user_profile_snapshots_poll_idx").on(t.pollId),
    index("user_profile_snapshots_mu_recorded_at_idx").on(t.muId, t.recordedAt),
  ],
);
```

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate`

Expected: new `drizzle/0012_*.sql` (or next number) creating both tables + indexes.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(db): add user profile poll and snapshot tables

EOF
)"
```

---

### Task 2: Parse tier-A `user.getUserById` profile

**Files:**
- Modify: `src/warera/users.ts`
- Modify: `src/warera/users.test.ts`
- Modify: `src/warera/index.ts` (re-export new types/helpers if that file re-exports users)

**Interfaces:**
- Consumes: existing `asRecord` / pick helpers in `users.ts`; `fetchUserByIdBatch` batch plumbing
- Produces:
  - `ParsedUserProfile` (full tier A)
  - `parseUserProfile(raw, requestedUserId?: string): ParsedUserProfile`
  - `fetchUserProfileBatch(warera, userIds): Promise<Map<string, ParsedUserProfile | null>>`
  - Keep `parseUserById` / `UserByIdRef` working (can implement thin ref via profile or leave as-is)

- [ ] **Step 1: Write failing parser tests in `src/warera/users.test.ts`**

```ts
describe("parseUserProfile", () => {
  it("extracts tier-A identity, dates, leveling, and premium", () => {
    const parsed = parseUserProfile({
      _id: "u1",
      username: "Alice",
      avatarUrl: "https://example.com/a.png",
      country: "c1",
      mu: "mu1",
      company: { _id: "co1" },
      party: "p1",
      isActive: true,
      militaryRank: 12,
      createdAt: "2026-01-02T03:04:05.000Z",
      dates: {
        lastConnectionAt: "2026-09-04T08:00:00.000Z",
        lastWorkAt: "2026-09-04T07:00:00.000Z",
        lastHelpAskedAt: "2026-09-04T06:00:00.000Z",
        lastDailyRewardClaimedAt: "2026-09-04T05:00:00.000Z",
        lastCompanyJoinedAt: "2026-08-01T00:00:00.000Z",
        lastDailyCalendarClaimedAt: "2026-09-03T00:00:00.000Z",
        lastSkillsResetAt: "2026-07-01T00:00:00.000Z",
      },
      leveling: {
        level: 10,
        totalXp: 1000,
        dailyXpLeft: 50,
        availableSkillPoints: 1,
        spentSkillPoints: 40,
        totalSkillPoints: 41,
        prestigeLevel: 2,
      },
      infos: { isPremium: true, premiumMonthsCount: 3 },
    });
    expect(parsed.userId).toBe("u1");
    expect(parsed.username).toBe("Alice");
    expect(parsed.muId).toBe("mu1");
    expect(parsed.companyId).toBe("co1");
    expect(parsed.partyId).toBe("p1");
    expect(parsed.isActive).toBe(true);
    expect(parsed.isPremium).toBe(true);
    expect(parsed.premiumMonthsCount).toBe(3);
    expect(parsed.level).toBe(10);
    expect(parsed.lastConnectionAt?.toISOString()).toBe("2026-09-04T08:00:00.000Z");
  });

  it("defaults nullable fields when missing", () => {
    const parsed = parseUserProfile({ _id: "u2" });
    expect(parsed.userId).toBe("u2");
    expect(parsed.username).toBeNull();
    expect(parsed.isActive).toBeNull();
    expect(parsed.lastConnectionAt).toBeNull();
    expect(parsed.isPremium).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/warera/users.test.ts`

Expected: FAIL — `parseUserProfile` not defined.

- [ ] **Step 3: Implement `ParsedUserProfile` + `parseUserProfile` + `fetchUserProfileBatch`**

In `src/warera/users.ts`:

```ts
export type ParsedUserProfile = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  countryId: string | null;
  muId: string | null;
  companyId: string | null;
  partyId: string | null;
  isActive: boolean | null;
  lastConnectionAt: Date | null;
  lastWorkAt: Date | null;
  lastHelpAskedAt: Date | null;
  lastDailyRewardClaimedAt: Date | null;
  lastCompanyJoinedAt: Date | null;
  lastDailyCalendarClaimedAt: Date | null;
  lastSkillsResetAt: Date | null;
  level: number | null;
  totalXp: number | null;
  dailyXpLeft: number | null;
  availableSkillPoints: number | null;
  spentSkillPoints: number | null;
  totalSkillPoints: number | null;
  prestigeLevel: number | null;
  militaryRank: number | null;
  isPremium: boolean | null;
  premiumMonthsCount: number | null;
  createdAtGame: Date | null;
};

function pickDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function pickBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function parseUserProfile(raw: unknown, requestedUserId?: string): ParsedUserProfile {
  const obj = asRecord(raw) ?? {};
  const payloadUserId = pickString(obj, ["_id", "id", "userId"]);
  if (payloadUserId && requestedUserId && payloadUserId !== requestedUserId) {
    throw new Error(
      `user.getUserById id mismatch: requested ${requestedUserId}, got ${payloadUserId}`,
    );
  }
  const userId = payloadUserId ?? requestedUserId;
  if (!userId) throw new Error("user.getUserById response missing id");

  const dates = asRecord(obj.dates) ?? {};
  const leveling = asRecord(obj.leveling) ?? {};
  const infos = asRecord(obj.infos) ?? {};

  return {
    userId,
    username: pickString(obj, ["username", "name"]),
    avatarUrl: pickString(obj, ["avatarUrl"]),
    countryId: pickNestedId(obj, ["countryId", "country"], ["country"]),
    muId: pickNestedId(obj, ["mu", "muId", "militaryUnit"], ["mu", "militaryUnit"]),
    companyId: pickNestedId(obj, ["companyId", "company"], ["company"]),
    partyId: pickNestedId(obj, ["partyId", "party"], ["party"]),
    isActive: pickBool(obj.isActive),
    lastConnectionAt: pickDate(dates.lastConnectionAt),
    lastWorkAt: pickDate(dates.lastWorkAt),
    lastHelpAskedAt: pickDate(dates.lastHelpAskedAt),
    lastDailyRewardClaimedAt: pickDate(dates.lastDailyRewardClaimedAt),
    lastCompanyJoinedAt: pickDate(dates.lastCompanyJoinedAt),
    lastDailyCalendarClaimedAt: pickDate(dates.lastDailyCalendarClaimedAt),
    lastSkillsResetAt: pickDate(dates.lastSkillsResetAt),
    level: pickInt(leveling.level),
    totalXp: pickInt(leveling.totalXp ?? leveling.xp),
    dailyXpLeft: pickInt(leveling.dailyXpLeft),
    availableSkillPoints: pickInt(leveling.availableSkillPoints),
    spentSkillPoints: pickInt(leveling.spentSkillPoints),
    totalSkillPoints: pickInt(leveling.totalSkillPoints),
    prestigeLevel: pickInt(leveling.prestigeLevel),
    militaryRank: pickInt(obj.militaryRank),
    isPremium: pickBool(infos.isPremium),
    premiumMonthsCount: pickInt(infos.premiumMonthsCount),
    createdAtGame: pickDate(obj.createdAt),
  };
}

function pickInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}
```

Add `fetchUserProfileBatch` mirroring `fetchUserByIdBatch` but calling `parseUserProfile(slot.data, userId)`.

Optionally implement `parseUserById` as:

```ts
export function parseUserById(raw: unknown, requestedUserId?: string): UserByIdRef {
  const p = parseUserProfile(raw, requestedUserId);
  return {
    userId: p.userId,
    username: p.username,
    companyId: p.companyId,
    muId: p.muId,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/warera/users.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warera/users.ts src/warera/users.test.ts src/warera/index.ts
git commit -m "$(cat <<'EOF'
feat(warera): parse tier-A user.getUserById profiles

EOF
)"
```

---

### Task 3: DB helpers — insert + latest + roster user ids

**Files:**
- Create: `src/db/user-profiles.ts`
- Create: `src/db/user-profiles.test.ts`

**Interfaces:**
- Consumes: `userProfilePolls`, `userProfileSnapshots`, `muMembers`, `listDistinctWatchedMuIds`
- Produces:
  - `USER_PROFILE_JOB_MAX_AGE_MS = 10 * 60 * 1000`
  - `UserProfileSnapshotRow` (insert shape without `pollId`)
  - `insertUserProfilePoll(...) => Promise<number>`
  - `insertUserProfileSnapshots(db, pollId, rows) => Promise<void>`
  - `listDistinctWatchedMuMemberUserIds(db) => Promise<{ userIds: string[]; muCount: number }>`
  - `getLatestUserProfile(db, userId) => Promise<UserProfileSnapshot | null>`

- [ ] **Step 1: Write failing DB tests**

Bootstrap in-memory tables matching schema (same style as `src/db/mu-stats.test.ts` / `sync-followed-players.test.ts`). Cover:

1. `listDistinctWatchedMuMemberUserIds` returns distinct members across watched MUs and `muCount`
2. `insertUserProfilePoll` + snapshots; `getLatestUserProfile` returns newest `recorded_at`
3. Empty watchlist → `{ userIds: [], muCount: 0 }`

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/db/user-profiles.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/db/user-profiles.ts`**

```ts
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { muMembers, userProfilePolls, userProfileSnapshots } from "./schema";
import { listDistinctWatchedMuIds } from "./watch-reasons";

export const USER_PROFILE_JOB_MAX_AGE_MS = 10 * 60 * 1000;

export type UserProfileSnapshotRow = {
  userId: string;
  recordedAt: Date;
  username: string | null;
  avatarUrl: string | null;
  countryId: string | null;
  muId: string | null;
  companyId: string | null;
  partyId: string | null;
  isActive: boolean | null;
  lastConnectionAt: Date | null;
  lastWorkAt: Date | null;
  lastHelpAskedAt: Date | null;
  lastDailyRewardClaimedAt: Date | null;
  lastCompanyJoinedAt: Date | null;
  lastDailyCalendarClaimedAt: Date | null;
  lastSkillsResetAt: Date | null;
  level: number | null;
  totalXp: number | null;
  dailyXpLeft: number | null;
  availableSkillPoints: number | null;
  spentSkillPoints: number | null;
  totalSkillPoints: number | null;
  prestigeLevel: number | null;
  militaryRank: number | null;
  isPremium: boolean | null;
  premiumMonthsCount: number | null;
  createdAtGame: Date | null;
};

export async function listDistinctWatchedMuMemberUserIds(
  db: Db,
): Promise<{ userIds: string[]; muCount: number }> {
  const muIds = await listDistinctWatchedMuIds(db);
  if (muIds.length === 0) return { userIds: [], muCount: 0 };
  const rows = await db
    .select({ userId: muMembers.userId })
    .from(muMembers)
    .where(inArray(muMembers.muId, muIds));
  return {
    userIds: [...new Set(rows.map((r) => r.userId))],
    muCount: muIds.length,
  };
}

export async function insertUserProfilePoll(
  db: Db,
  values: {
    recordedAt: Date;
    status: string;
    error?: string | null;
    userCount: number;
    muCount: number;
  },
): Promise<number> {
  const result = await db
    .insert(userProfilePolls)
    .values({
      recordedAt: values.recordedAt,
      status: values.status,
      error: values.error ?? null,
      userCount: values.userCount,
      muCount: values.muCount,
    })
    .returning({ id: userProfilePolls.id });
  const id = result[0]?.id;
  if (id == null) throw new Error("Failed to insert user_profile_polls row");
  return id;
}

export async function insertUserProfileSnapshots(
  db: Db,
  pollId: number,
  rows: UserProfileSnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(userProfileSnapshots).values(
    rows.map((row) => ({
      pollId,
      ...row,
    })),
  );
}

export async function getLatestUserProfile(
  db: Db,
  userId: string,
): Promise<(UserProfileSnapshotRow & { pollId: number; id: number }) | null> {
  const rows = await db
    .select()
    .from(userProfileSnapshots)
    .where(eq(userProfileSnapshots.userId, userId))
    .orderBy(desc(userProfileSnapshots.recordedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    pollId: row.pollId,
    userId: row.userId,
    recordedAt: row.recordedAt,
    username: row.username,
    avatarUrl: row.avatarUrl,
    countryId: row.countryId,
    muId: row.muId,
    companyId: row.companyId,
    partyId: row.partyId,
    isActive: row.isActive,
    lastConnectionAt: row.lastConnectionAt,
    lastWorkAt: row.lastWorkAt,
    lastHelpAskedAt: row.lastHelpAskedAt,
    lastDailyRewardClaimedAt: row.lastDailyRewardClaimedAt,
    lastCompanyJoinedAt: row.lastCompanyJoinedAt,
    lastDailyCalendarClaimedAt: row.lastDailyCalendarClaimedAt,
    lastSkillsResetAt: row.lastSkillsResetAt,
    level: row.level,
    totalXp: row.totalXp,
    dailyXpLeft: row.dailyXpLeft,
    availableSkillPoints: row.availableSkillPoints,
    spentSkillPoints: row.spentSkillPoints,
    totalSkillPoints: row.totalSkillPoints,
    prestigeLevel: row.prestigeLevel,
    militaryRank: row.militaryRank,
    isPremium: row.isPremium,
    premiumMonthsCount: row.premiumMonthsCount,
    createdAtGame: row.createdAtGame,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/db/user-profiles.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/user-profiles.ts src/db/user-profiles.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add user profile snapshot helpers

EOF
)"
```

---

### Task 4: `resolveUserByIdRef` (DB-first)

**Files:**
- Create: `src/user/resolve-user-by-id.ts`
- Create: `src/user/resolve-user-by-id.test.ts`

**Interfaces:**
- Consumes: `getLatestUserProfile`, `fetchUserById`, `UserByIdRef`
- Produces:
  - `resolveUserByIdRef(options: { db: Db; warera: WareraRequester; userId: string; maxAgeMs?: number; now?: Date }): Promise<UserByIdRef>`

- [ ] **Step 1: Write failing tests**

Cases:

1. Snapshot present and fresh → returns mapped ref; `warera.request` / `requestBatch` **not** called
2. No snapshot → calls `fetchUserById` path and returns API ref
3. Snapshot older than `maxAgeMs` → API path
4. API fallback does **not** insert into `user_profile_snapshots` (assert count unchanged)

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/user/resolve-user-by-id.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
import type { Db } from "../db/client";
import { getLatestUserProfile } from "../db/user-profiles";
import type { WareraRequester } from "../warera/prices";
import { fetchUserById, type UserByIdRef } from "../warera/users";

export async function resolveUserByIdRef(options: {
  db: Db;
  warera: WareraRequester;
  userId: string;
  maxAgeMs?: number;
  now?: Date;
}): Promise<UserByIdRef> {
  const { db, warera, userId } = options;
  const now = options.now ?? new Date();
  const latest = await getLatestUserProfile(db, userId);
  if (latest) {
    const ageMs = now.getTime() - latest.recordedAt.getTime();
    const fresh = options.maxAgeMs == null || ageMs <= options.maxAgeMs;
    if (fresh) {
      return {
        userId: latest.userId,
        username: latest.username,
        muId: latest.muId,
        companyId: latest.companyId,
      };
    }
  }
  return fetchUserById(warera, userId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/user/resolve-user-by-id.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/resolve-user-by-id.ts src/user/resolve-user-by-id.test.ts
git commit -m "$(cat <<'EOF'
feat(user): resolve getUserById refs from latest profile snapshot

EOF
)"
```

---

### Task 5: Job `mu-member-poll` + registry + inventory

**Files:**
- Create: `src/jobs/mu-member-poll/run.ts`
- Create: `src/jobs/mu-member-poll/index.ts`
- Create: `src/jobs/mu-member-poll/run.test.ts`
- Modify: `src/jobs/registry.ts`
- Modify: `docs/warera-api/inventory.md`

**Interfaces:**
- Consumes: list/insert helpers, `fetchUserProfileBatch`, logger
- Produces: `runMuMemberPoll(...) => { pollId, userCount, muCount, status }`

- [ ] **Step 1: Write failing job tests in `run.test.ts`**

In-memory schema: `mu_watch_reasons`, `mu_members`, `user_profile_polls`, `user_profile_snapshots` (minimal columns).

Cases:

1. Watched MU + 2 members → poll `success`, 2 snapshots, batch called once with both ids
2. One batch slot fails → `partial`, one snapshot
3. No watched MUs / empty roster → `success`, `user_count = 0`, **no** WarEra batch call
4. All slots fail with non-empty roster → `error`

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/jobs/mu-member-poll/run.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `run.ts`**

```ts
import type { Db } from "../../db/client";
import {
  insertUserProfilePoll,
  insertUserProfileSnapshots,
  listDistinctWatchedMuMemberUserIds,
  type UserProfileSnapshotRow,
} from "../../db/user-profiles";
import type { Logger } from "../../logging/logger";
import type { WareraRequester } from "../../warera/prices";
import { fetchUserProfileBatch } from "../../warera/users";

export type MuMemberPollResult = {
  pollId: number;
  userCount: number;
  muCount: number;
  status: "success" | "partial" | "error";
};

export async function runMuMemberPoll(options: {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
  now?: Date;
}): Promise<MuMemberPollResult> {
  const { db, warera, logger } = options;
  const recordedAt = options.now ?? new Date();
  const { userIds, muCount } = await listDistinctWatchedMuMemberUserIds(db);

  if (userIds.length === 0) {
    const pollId = await insertUserProfilePoll(db, {
      recordedAt,
      status: "success",
      userCount: 0,
      muCount,
    });
    logger.info({ poll_id: pollId, user_count: 0, mu_count: muCount, status: "success" }, "mu member poll complete");
    return { pollId, userCount: 0, muCount, status: "success" };
  }

  const profiles = await fetchUserProfileBatch(warera, userIds);
  const rows: UserProfileSnapshotRow[] = [];
  const errors: string[] = [];
  for (const userId of userIds) {
    const profile = profiles.get(userId);
    if (!profile) {
      errors.push(`user ${userId}: lookup failed`);
      continue;
    }
    rows.push({ ...profile, recordedAt });
  }

  let status: MuMemberPollResult["status"] = "success";
  if (rows.length === 0) status = "error";
  else if (errors.length > 0) status = "partial";

  const pollId = await insertUserProfilePoll(db, {
    recordedAt,
    status,
    error: errors.length > 0 ? errors.slice(0, 20).join("; ") : null,
    userCount: rows.length,
    muCount,
  });
  await insertUserProfileSnapshots(db, pollId, rows);

  logger.info(
    {
      poll_id: pollId,
      user_count: rows.length,
      mu_count: muCount,
      status,
      error_count: errors.length,
    },
    "mu member poll complete",
  );
  return { pollId, userCount: rows.length, muCount, status };
}
```

Note: `ParsedUserProfile` fields align with `UserProfileSnapshotRow` except `recordedAt` — spread carefully (omit nothing required; do not include extra keys).

- [ ] **Step 4: Implement `index.ts` and register**

```ts
import type { JobDefinition } from "../types";
import { runMuMemberPoll } from "./run";

export const muMemberPollJob: JobDefinition = {
  id: "mu-member-poll",
  name: "MU Member Poll",
  description:
    "Batch-fetches user.getUserById for members of watched MUs and appends activity/identity snapshots",
  defaultCron: "0 */5 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runMuMemberPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.userCount} users across ${result.muCount} MUs (${result.status})`;
  },
};
```

In `registry.ts`, import and add `muMemberPollJob` next to `muStatsPollJob`.

- [ ] **Step 5: Update `docs/warera-api/inventory.md`**

Add a Geo (or Geo-adjacent) row:

| Resource | What | Who refreshes | Cadence | Upstream | Storage | Main consumers |
| MU member profiles / activity | Identity + activity dates/leveling/premium for watched MU rosters | `mu-member-poll` | Every 5 minutes | `user.getUserById` batch | Append-only `user_profile_polls` / `user_profile_snapshots` | Follow sync (DB-first), future MU activity tools |

Bump **Last reviewed** date to `2026-09-04`.

- [ ] **Step 6: Run job tests**

Run: `vp test src/jobs/mu-member-poll/run.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/jobs/mu-member-poll src/jobs/registry.ts docs/warera-api/inventory.md
git commit -m "$(cat <<'EOF'
feat(jobs): add mu-member-poll for roster profile snapshots

EOF
)"
```

---

### Task 6: Migrate `syncFollowedPlayers` + follow add

**Files:**
- Modify: `src/jobs/sync-followed-players.ts`
- Modify: `src/jobs/sync-followed-players.test.ts`
- Modify: `src/server/routes/follow.ts`
- Modify: `src/server/routes/follow.test.ts` (if it asserts live `getUserById` on add)

**Interfaces:**
- Consumes: `resolveUserByIdRef`, `USER_PROFILE_JOB_MAX_AGE_MS`, existing upsert/reconcile
- Produces: same `syncFollowedPlayers` return shape

- [ ] **Step 1: Update failing expectations in `sync-followed-players.test.ts`**

Add case: insert a fresh `user_profile_snapshots` row for a followed player (needs poll parent row). Assert `requestBatch` is **not** invoked for that id (or batch only called for miss ids). Existing miss path still batches API.

Extend in-memory schema in the test harness with `user_profile_polls` / `user_profile_snapshots`.

- [ ] **Step 2: Run tests to verify new expectation fails**

Run: `vp test src/jobs/sync-followed-players.test.ts`

Expected: FAIL on the new snapshot-hit case (still always batches).

- [ ] **Step 3: Rewrite `syncFollowedPlayers` to resolve per id**

Preferred approach (clear + matches “DB first”):

```ts
for (const playerId of ids) {
  try {
    const ref = await resolveUserByIdRef({
      db,
      warera,
      userId: playerId,
      maxAgeMs: USER_PROFILE_JOB_MAX_AGE_MS,
      now,
    });
    await db.transaction(async (tx) => {
      await upsertPlayerCurrent(tx, {
        id: ref.userId,
        username: ref.username,
        muId: ref.muId,
        workplaceCompanyId: ref.companyId,
        payload: null,
        fetchedAt: now,
      });
      await reconcileFollowPlayerMu(tx, {
        playerId: ref.userId,
        muId: ref.muId,
        at: now,
      });
    });
    playerCount += 1;
  } catch {
    errors.push(`player ${playerId}: lookup failed`);
  }
}
```

Note: this may N+1 live API calls for cold followed players not on a watched roster — acceptable for v1 per design (those players stay on demand path). If a test requires batch for multiple misses, an optional optimization is fine **only if** tests still prove snapshot hits skip WarEra; do not invent snapshot writes.

- [ ] **Step 4: Change follow add to use helper**

In `follow.ts` POST `/players`:

```ts
ref = await resolveUserByIdRef({
  db,
  warera,
  userId: playerId,
  maxAgeMs: USER_PROFILE_JOB_MAX_AGE_MS,
});
```

Keep 404 mapping via `mapLookupError`.

- [ ] **Step 5: Run related tests**

Run:

```bash
vp test src/jobs/sync-followed-players.test.ts src/server/routes/follow.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/jobs/sync-followed-players.ts src/jobs/sync-followed-players.test.ts src/server/routes/follow.ts src/server/routes/follow.test.ts
git commit -m "$(cat <<'EOF'
feat(follow): prefer user profile snapshots over live getUserById

EOF
)"
```

---

### Task 7: Migrate `resolveJobWage` + `buildUser`

**Files:**
- Modify: `src/skills/job-wage.ts`
- Modify: `src/skills/job-wage.test.ts`
- Modify: `src/user/build.ts`

**Interfaces:**
- Consumes: `resolveUserByIdRef` when `db` provided; else existing `fetchUserById`
- Produces: `resolveJobWage({ warera, userId, db?, maxAgeMs?, now? })` (or keep positional warera and add options object — prefer single options object for clarity)

- [ ] **Step 1: Update `job-wage` signature and tests**

Change to:

```ts
export async function resolveJobWage(options: {
  warera: WareraRequester;
  userId: string;
  db?: Db;
  maxAgeMs?: number;
  now?: Date;
}): Promise<SkillsJob>
```

When `db` is set:

```ts
const { companyId: userCompanyId } = await resolveUserByIdRef({
  db: options.db,
  warera: options.warera,
  userId: options.userId,
  maxAgeMs: options.maxAgeMs ?? USER_PROFILE_JOB_MAX_AGE_MS,
  now: options.now,
});
```

When `db` omitted, keep `fetchUserById(warera, userId)` for unit tests that only mock Warera.

Update all `resolveJobWage({ request } as never, "u1")` call sites in tests to `resolveJobWage({ warera: { request }, userId: "u1" })`.

- [ ] **Step 2: Run job-wage tests (expect failures on call shape)**

Run: `vp test src/skills/job-wage.test.ts`

- [ ] **Step 3: Fix implementation + `buildUser`**

```ts
resolveJobWage({ warera, userId, db }),
```

- [ ] **Step 4: Run tests**

```bash
vp test src/skills/job-wage.test.ts src/server/routes/user.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/job-wage.ts src/skills/job-wage.test.ts src/user/build.ts
git commit -m "$(cat <<'EOF'
feat(skills): resolve job wage company via profile snapshot when available

EOF
)"
```

---

### Task 8: Final verification

**Files:** none new

- [ ] **Step 1: Run focused suite**

```bash
vp test \
  src/warera/users.test.ts \
  src/db/user-profiles.test.ts \
  src/user/resolve-user-by-id.test.ts \
  src/jobs/mu-member-poll/run.test.ts \
  src/jobs/sync-followed-players.test.ts \
  src/skills/job-wage.test.ts
```

Expected: all PASS

- [ ] **Step 2: Run `vp check`**

Expected: format/lint/types clean

- [ ] **Step 3: Commit any check-only fixes if needed**

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore: tidy after mu-member-poll check

EOF
)"
```

(Skip empty commit if nothing changed.)

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `user_profile_polls` / `user_profile_snapshots` typed tier A | Task 1 |
| Parse `user.getUserById` tier A | Task 2 |
| Snapshots-only insert + latest helper + roster ids | Task 3 |
| `resolveUserByIdRef` miss/stale/no insert | Task 4 |
| `mu-member-poll` 5m job + registry | Task 5 |
| Inventory update | Task 5 |
| Migrate `syncFollowedPlayers` + follow add | Task 6 |
| Migrate `job-wage` | Task 7 |
| Empty roster success / partial / error | Task 5 tests |
| No UI routes | Global constraint (no task adds routes) |
| No dual-write / no JSON payload | Global constraint |

## Placeholder scan

No TBD/TODO steps; concrete types, commands, and commit messages included.
