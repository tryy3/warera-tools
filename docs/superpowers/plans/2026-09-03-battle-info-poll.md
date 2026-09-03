# Battle Info Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 15-minute Croner job that discovers active battles via fully paginated `battle.getBattles`, sticky-tracks those where watched MUs appear in `muOrders`, upserts current battle rows + light scoreboard snapshots, appends per-member `battleLootSummary` snapshots, and on end (after ≥1m settle) calls `battle.getById` once for final metadata + final loot—no UI.

**Architecture:** Mirror `mu-stats-poll` (poll row + append-only snapshots + current entity table). Active scoreboard comes from embedded `currentRound` on getBattles items. End detection is set-difference of DB `is_active` vs a **complete** active getBattles walk; incomplete walks must not finalize. Loot fan-out uses existing tRPC `requestBatch`.

**Tech Stack:** TypeScript, Drizzle/Turso (libsql), Croner jobs, Vitest via `vp test`, Vite+ (`vp check` / `vp run db:generate`).

**Design:** [2026-09-03-battle-info-poll-design.md](../specs/2026-09-03-battle-info-poll-design.md)

## Global Constraints

- No UI, charts, or Hono read routes in this slice
- Watched MUs = distinct ids from `mu_watch_reasons` (same as `listMusForSync`); roster from `mu_members`
- Sticky: once a watched MU appears in `muOrders`, keep tracking until finalize even if the order disappears
- Cadence: `0 */15 * * * *`, default enabled
- Settle grace: `60_000` ms after first observe-as-ended before finalize
- Do **not** call `getLiveBattleData` in v1
- `getById` **only** on finalize path
- Scoreboard damages/points from `currentRound.*`, not side-level `attacker.damages` (often 0 while live)
- Full cursor drain of active battles required before end-detection
- Loot not-found → skip row (use `isWareraNotFoundError`); do not fail the whole poll
- Typed columns for known scalars; JSON for `mu_orders`, `sticky_mu_ids`, `rounds_history`, `pool_loot`, `payload`
- Retention: keep forever (no prune)
- Use existing `WareraRequester` / rate limiter / batch — no parallel HTTP stack
- Prefer `vp test path/to/file.test.ts` while iterating; `vp check` before finishing
- Update `docs/warera-api/inventory.md` in the same work
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | `battles`, `battle_polls`, `battle_scoreboard_snapshots`, `battle_loot_snapshots` |
| `drizzle/0010_*.sql` (+ meta) | Migration via `vp run db:generate` (next number after `0009_`) |
| `src/warera/battles.ts` | Parse + fetch getBattles page, getById, loot summary, cursor drain |
| `src/warera/battles.test.ts` | Parser + pagination + not-found loot tests |
| `src/warera/index.ts` | Re-export battle helpers used by jobs |
| `src/db/battles.ts` | List active/tracked, upsert current, sticky merge, mark ended/finalized |
| `src/db/battles.test.ts` | DB helper tests |
| `src/db/battle-stats.ts` | Insert poll + scoreboard + loot snapshots |
| `src/db/battle-stats.test.ts` | Insert tests |
| `src/jobs/battle-info-poll/run.ts` | Job orchestration |
| `src/jobs/battle-info-poll/index.ts` | JobDefinition |
| `src/jobs/battle-info-poll/run.test.ts` | Mocked WarEra end-to-end job test |
| `src/jobs/registry.ts` | Register job |
| `docs/warera-api/inventory.md` | Catalog the new job / tables |
| `.agents/skills/warera-api/SKILL.md` | Optional one-line note if battle procedures need call-outs (official OpenAPI — usually just inventory) |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0010_*.sql` + `drizzle/meta/*` via generate

**Interfaces:**
- Consumes: existing drizzle sqlite patterns in `schema.ts`
- Produces: tables `battles`, `battle_polls`, `battle_scoreboard_snapshots`, `battle_loot_snapshots`

- [ ] **Step 1: Append tables to `src/db/schema.ts`**

```ts
export const battlePollStatuses = ["success", "partial", "error"] as const;
export type BattlePollStatus = (typeof battlePollStatuses)[number];

export const battles = sqliteTable(
  "battles",
  {
    id: text("id").primaryKey(),
    warId: text("war_id"),
    type: text("type"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    attackerCountryId: text("attacker_country_id"),
    defenderCountryId: text("defender_country_id"),
    attackerRegionId: text("attacker_region_id"),
    defenderRegionId: text("defender_region_id"),
    roundsToWin: integer("rounds_to_win"),
    currentRoundId: text("current_round_id"),
    currentRoundNumber: integer("current_round_number"),
    attackerWonRounds: integer("attacker_won_rounds"),
    defenderWonRounds: integer("defender_won_rounds"),
    attackerMuOrders: text("attacker_mu_orders", { mode: "json" }).$type<string[] | null>(),
    defenderMuOrders: text("defender_mu_orders", { mode: "json" }).$type<string[] | null>(),
    stickyMuIds: text("sticky_mu_ids", { mode: "json" }).$type<string[] | null>(),
    roundsHistory: text("rounds_history", { mode: "json" }).$type<unknown[] | null>(),
    startedAtGame: integer("started_at_game", { mode: "timestamp_ms" }),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (t) => [index("battles_is_active_idx").on(t.isActive)],
);

export const battlePolls = sqliteTable(
  "battle_polls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    error: text("error"),
    activeBattlePages: integer("active_battle_pages"),
    battleCount: integer("battle_count").notNull().default(0),
    lootSnapshotCount: integer("loot_snapshot_count").notNull().default(0),
    finalizedCount: integer("finalized_count").notNull().default(0),
  },
  (t) => [index("battle_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const battleScoreboardSnapshots = sqliteTable(
  "battle_scoreboard_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => battlePolls.id),
    battleId: text("battle_id").notNull(),
    roundId: text("round_id"),
    roundNumber: integer("round_number"),
    roundIsActive: integer("round_is_active", { mode: "boolean" }),
    attackerPoints: real("attacker_points"),
    defenderPoints: real("defender_points"),
    attackerDamages: real("attacker_damages"),
    defenderDamages: real("defender_damages"),
    attackerHitCount: integer("attacker_hit_count"),
    defenderHitCount: integer("defender_hit_count"),
    ticksCount: integer("ticks_count"),
    nextTickAt: integer("next_tick_at", { mode: "timestamp_ms" }),
    roundStartedAtGame: integer("round_started_at_game", { mode: "timestamp_ms" }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("battle_scoreboard_snapshots_battle_poll_idx").on(t.battleId, t.pollId),
    index("battle_scoreboard_snapshots_battle_recorded_at_idx").on(t.battleId, t.recordedAt),
  ],
);

export const battleLootSnapshots = sqliteTable(
  "battle_loot_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => battlePolls.id),
    battleId: text("battle_id").notNull(),
    userId: text("user_id").notNull(),
    muId: text("mu_id").notNull(),
    totalDmg: real("total_dmg"),
    hits: integer("hits"),
    totalMoneyFromBounty: real("total_money_from_bounty"),
    totalMoneyFromContract: real("total_money_from_contract"),
    case1Count: integer("case1_count"),
    case2Count: integer("case2_count"),
    poolLoot: text("pool_loot", { mode: "json" }).$type<unknown[] | null>(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("battle_loot_snapshots_battle_user_poll_idx").on(t.battleId, t.userId, t.pollId),
    index("battle_loot_snapshots_mu_recorded_at_idx").on(t.muId, t.recordedAt),
  ],
);
```

- [ ] **Step 2: Generate migration**

Run: `vp run db:generate`  
Expected: new `drizzle/0010_*.sql` (or next free number) creating the four tables + indexes.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add battle poll and snapshot tables"
```

---

### Task 2: WarEra battle parsers + fetch helpers

**Files:**
- Create: `src/warera/battles.ts`
- Create: `src/warera/battles.test.ts`
- Modify: `src/warera/index.ts` (export public helpers)

**Interfaces:**
- Consumes: `WareraRequester`, `wareraProcedurePath`, `unwrapTrpcData`, `isWareraNotFoundError`
- Produces:
  - `parseBattleListItem(raw): ParsedBattle`
  - `parseBattleById(raw): ParsedBattle` (same shape; `currentRound` may be id string or absent — tolerate both)
  - `parseBattleLootSummary(raw): ParsedBattleLootSummary`
  - `fetchActiveBattlesPage(warera, { limit?, cursor? }): Promise<{ items: ParsedBattle[]; nextCursor: string | null }>`
  - `fetchAllActiveBattles(warera): Promise<{ battles: ParsedBattle[]; pages: number; complete: boolean }>`
  - `fetchBattleById(warera, battleId): Promise<ParsedBattle>`
  - `fetchBattleLootSummary(warera, battleId, userId): Promise<ParsedBattleLootSummary | null>`
  - `scoreboardFromBattle(battle: ParsedBattle): BattleScoreboardFields | null`
  - `BATTLE_END_SETTLE_MS = 60_000`

`ParsedBattle` must include at least: `id`, `warId`, `type`, `isActive`, side country/region ids, `wonRoundsCount`, `muOrders`, side `hitCount`, `roundsToWin`, `rounds` (string[]), `roundsHistory`, `startedAtGame`, embedded `currentRound` (`id`, `number`, `isActive`, attacker/defender `damages`/`points`, `live.ticksCount`/`nextTickAt`, `createdAt`), `payload` leftovers.

- [ ] **Step 1: Write failing parser tests** in `src/warera/battles.test.ts`

Cover:
1. getBattles-shaped item: `currentRound` object with points/damages/`live.nextTickAt`; `muOrders` arrays; side `hitCount`.
2. `scoreboardFromBattle` reads damages from `currentRound`, not side `damages: 0`.
3. Loot summary fields: `totalDmg`, `hits`, `totalMoneyFromBounty`, `totalMoneyFromContract`, `case1Count`, `case2Count`, `poolLoot`.
4. `fetchBattleLootSummary` returns `null` when request throws `isWareraNotFoundError`.
5. `fetchAllActiveBattles` follows `nextCursor` across 2 pages and sets `complete: true`; if a page throws, `complete: false` and returns what was gathered (or empty — pick **return pages fetched so far + complete:false** and document in test).

Use fixtures shaped like live API (see design / prior research). Minimal example for list item:

```ts
const battleListFixture = {
  _id: "b1",
  war: "w1",
  type: "war",
  isActive: true,
  roundsToWin: 2,
  rounds: ["r1"],
  roundsHistory: [],
  createdAt: "2026-09-03T10:00:00.000Z",
  attacker: {
    country: "cA",
    region: "regA",
    wonRoundsCount: 0,
    muOrders: ["mu1"],
    damages: 0,
    hitCount: 10,
  },
  defender: {
    country: "cD",
    region: "regD",
    wonRoundsCount: 0,
    muOrders: [],
    damages: 0,
    hitCount: 8,
  },
  currentRound: {
    _id: "r1",
    battle: "b1",
    number: 1,
    isActive: true,
    createdAt: "2026-09-03T10:00:00.000Z",
    attacker: { country: "cA", damages: 1000, points: 5 },
    defender: { country: "cD", damages: 800, points: 3 },
    live: { ticksCount: 2, actualTickPoints: 1, nextTickAt: "2026-09-03T10:02:00.000Z" },
  },
};
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `vp test src/warera/battles.test.ts`  
Expected: FAIL (module / exports missing)

- [ ] **Step 3: Implement `src/warera/battles.ts`**

Follow patterns in `src/warera/mu.ts` / `src/warera/transactions.ts` (`asRecord`, `pickString`, `unwrapTrpcData`, GET with `wareraProcedurePath`).

```ts
export const BATTLE_END_SETTLE_MS = 60_000;

export async function fetchActiveBattlesPage(
  warera: WareraRequester,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ items: ParsedBattle[]; nextCursor: string | null }> {
  const input: Record<string, unknown> = { isActive: true, limit: opts.limit ?? 50 };
  if (opts.cursor) input.cursor = opts.cursor;
  const json = await warera.request<unknown>(wareraProcedurePath("battle.getBattles", input));
  const data = unwrapTrpcData(json);
  const obj = asRecord(data) ?? {};
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const nextCursor =
    (typeof obj.nextCursor === "string" && obj.nextCursor) ||
    (typeof obj.cursor === "string" && obj.cursor) ||
    null;
  return { items: rawItems.map(parseBattleListItem).filter(Boolean) as ParsedBattle[], nextCursor };
}

export async function fetchAllActiveBattles(warera: WareraRequester): Promise<{
  battles: ParsedBattle[];
  pages: number;
  complete: boolean;
}> {
  const battles: ParsedBattle[] = [];
  let cursor: string | undefined;
  let pages = 0;
  try {
    for (;;) {
      const page = await fetchActiveBattlesPage(warera, { cursor, limit: 50 });
      pages += 1;
      battles.push(...page.items);
      if (!page.nextCursor) return { battles, pages, complete: true };
      cursor = page.nextCursor;
    }
  } catch {
    return { battles, pages, complete: false };
  }
}

export async function fetchBattleLootSummary(
  warera: WareraRequester,
  battleId: string,
  userId: string,
): Promise<ParsedBattleLootSummary | null> {
  try {
    const json = await warera.request<unknown>(
      wareraProcedurePath("battleLootSummary.getByBattleAndUser", { battleId, userId }),
    );
    return parseBattleLootSummary(unwrapTrpcData(json));
  } catch (err) {
    if (isWareraNotFoundError(err)) return null;
    throw err;
  }
}
```

Also implement `fetchBattleById` via `battle.getById` + `parseBattleById` (when `currentRound` is a string id only, leave embedded scoreboard null — finalize path cares about `roundsHistory` / won rounds / orders).

- [ ] **Step 4: Run tests — expect PASS**

Run: `vp test src/warera/battles.test.ts`  
Expected: PASS

- [ ] **Step 5: Export from `src/warera/index.ts`**

Export the types and functions listed in Interfaces.

- [ ] **Step 6: Commit**

```bash
git add src/warera/battles.ts src/warera/battles.test.ts src/warera/index.ts
git commit -m "feat(warera): add battle list, byId, and loot summary helpers"
```

---

### Task 3: DB helpers for battles + snapshots

**Files:**
- Create: `src/db/battles.ts`
- Create: `src/db/battles.test.ts`
- Create: `src/db/battle-stats.ts`
- Create: `src/db/battle-stats.test.ts`

**Interfaces:**
- Consumes: schema tables; `ParsedBattle` / scoreboard fields from Task 2
- Produces:
  - `listActiveTrackedBattles(db): Promise<BattleRow[]>` — `is_active = true`
  - `upsertBattleFromParsed(db, parsed, opts: { stickyMuIds: string[]; fetchedAt: Date; endedAt?: Date | null; finalizedAt?: Date | null; isActive?: boolean }): Promise<void>`
  - `mergeStickyMuIds(existing: string[] | null, add: string[]): string[]` (sorted unique)
  - `markBattleEnded(db, battleId, endedAt: Date): Promise<void>` — set `ended_at` only if null
  - `markBattleFinalized(db, battleId, finalizedAt: Date): Promise<void>` — `is_active=false`, set `finalized_at`
  - `insertBattlePoll(db, values): Promise<number>`
  - `insertBattleScoreboardSnapshots(db, pollId, rows): Promise<void>`
  - `insertBattleLootSnapshots(db, pollId, rows): Promise<void>`

Bootstrap tests with inline `CREATE TABLE` SQL matching schema (same pattern as `src/db/mu-stats.test.ts` / `mus.test.ts`).

- [ ] **Step 1: Write failing DB tests**

- Upsert then list active
- Sticky merge unions MU ids and does not drop old ones when orders change
- `markBattleEnded` does not overwrite an existing `ended_at`
- `markBattleFinalized` clears `is_active`
- Poll + scoreboard + loot inserts return ids / row counts

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/db/battles.test.ts src/db/battle-stats.test.ts`

- [ ] **Step 3: Implement helpers**

`upsertBattleFromParsed` should map parsed fields onto `battles` columns; on conflict update identity/orders/rounds/scoreboard current fields and `sticky_mu_ids` (merged), without clearing `ended_at`/`finalized_at` unless explicitly passed.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/db/battles.ts src/db/battles.test.ts src/db/battle-stats.ts src/db/battle-stats.test.ts
git commit -m "feat(db): add battle upsert and snapshot insert helpers"
```

---

### Task 4: Job `battle-info-poll` + registry

**Files:**
- Create: `src/jobs/battle-info-poll/run.ts`
- Create: `src/jobs/battle-info-poll/index.ts`
- Create: `src/jobs/battle-info-poll/run.test.ts`
- Modify: `src/jobs/registry.ts`

**Interfaces:**
- Consumes: Task 2–3 helpers; `listMusForSync`, `listMuMembers` from `src/db/mus.ts`
- Produces: `runBattleInfoPoll({ db, warera, logger, now?: Date }): Promise<{ pollId, battleCount, lootSnapshotCount, finalizedCount, status }>`
- Job id: `battle-info-poll`; cron `0 */15 * * * *`; `defaultEnabled: true`

- [ ] **Step 1: Write failing job orchestration tests** in `run.test.ts`

Use mocked `warera.request` (and/or inject a thin fake requester) + in-memory sqlite schema bootstrap.

Scenarios:
1. **Happy path:** one active battle with watched MU in `muOrders` → upsert battle, 1 scoreboard snapshot, loot for each roster member that returns data; poll `success`.
2. **Irrelevant battle:** active battle with no watched MU and not sticky → no DB row / no loot.
3. **Sticky after order removed:** battle already sticky in DB; active list still has battle but `muOrders` empty → still scoreboard + loot; sticky ids preserved.
4. **Incomplete pagination:** `fetchAllActiveBattles` incomplete → do **not** mark missing DB battle as ended; status `partial`/`error`.
5. **End + grace:** DB active battle absent from complete active set → set `ended_at`; with `now - ended_at < 60s` → loot still attempted, **no** `getById`, not finalized.
6. **Finalize:** `ended_at` older than 60s → one `battle.getById`, final loot, `is_active=false`, `finalized_at` set.
7. **Loot not-found:** member with NOT_FOUND → no loot row, poll still success if otherwise ok.

Seed test DB with `mu_watch_reasons` + `mu_members` (+ `mus` if FK required — `mu_members` references `mus.id`).

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/jobs/battle-info-poll/run.test.ts`

- [ ] **Step 3: Implement `run.ts` orchestration**

Pseudocode (implement fully; do not leave stubs):

```ts
const watchedMuIds = await listMusForSync(db);
const watchedSet = new Set(watchedMuIds);
const rosterByMu = new Map<string, string[]>();
for (const muId of watchedMuIds) {
  rosterByMu.set(muId, (await listMuMembers(db, muId)).map((m) => m.userId));
}

const { battles: activeList, pages, complete } = await fetchAllActiveBattles(warera);
const activeById = new Map(activeList.map((b) => [b.id, b]));

const errors: string[] = [];
if (!complete) errors.push("active battle pagination incomplete");

// sticky / relevant from active list
for (const b of activeList) {
  const orderMus = [...(b.attackerMuOrders ?? []), ...(b.defenderMuOrders ?? [])];
  const hit = orderMus.filter((id) => watchedSet.has(id));
  if (hit.length === 0) continue;
  // upsert with sticky merge
}

const dbActive = await listActiveTrackedBattles(db);
// workset = dbActive that are in activeById OR settling/finalizing
// for absent + complete: mark ended / maybe finalize with getById
// buffer scoreboard snapshots for active workset from activeById parsed battles
// loot: for each workset battle × members of stickyMuIds (dedupe userId → first muId)
```

Use sequential or batched loot fetches. Prefer `warera.requestBatch` if the client is the full client; if tests only mock `.request`, sequential `fetchBattleLootSummary` is acceptable for v1 (document in code comment). Rate limiter already serializes.

Status:
- `error` if no usable work and hard failure (e.g. pagination incomplete and nothing else)
- `partial` if any per-battle/loot/getById errors or incomplete pagination but some snapshots written
- `success` otherwise

- [ ] **Step 4: Add JobDefinition + register**

```ts
// src/jobs/battle-info-poll/index.ts
export const battleInfoPollJob: JobDefinition = {
  id: "battle-info-poll",
  name: "Battle Info Poll",
  description:
    "Tracks battles where watched MUs have orders; scoreboard + loot snapshots; finalizes ended battles via getById",
  defaultCron: "0 */15 * * * *",
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runBattleInfoPoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.battleCount} battles, ${result.lootSnapshotCount} loot, ${result.finalizedCount} finalized (${result.status})`;
  },
};
```

Register in `listJobDefinitions()` in `src/jobs/registry.ts` (near `muStatsPollJob`).

- [ ] **Step 5: Run job tests — expect PASS**

Run: `vp test src/jobs/battle-info-poll/run.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/jobs/battle-info-poll src/jobs/registry.ts
git commit -m "feat(jobs): add battle-info-poll for ordered MU battles"
```

---

### Task 5: Inventory + verification

**Files:**
- Modify: `docs/warera-api/inventory.md`
- Optionally: `AGENTS.md` (one line under jobs / Geo if it lists jobs)

- [ ] **Step 1: Update inventory**

Add under Global or Geo (prefer **Global** battle catalog filtered by Geo MU watchlist — note both):

| Resource | What | Who refreshes | Cadence | Upstream | Storage | Consumers |
| --- | --- | --- | --- | --- | --- | --- |
| Battles (ordered) | Active/ended battles sticky when watched MU in `muOrders`; light scoreboard + per-member loot | `battle-info-poll` | Every 15 minutes | `battle.getBattles` (full cursor), `battle.getById` on finalize only, `battleLootSummary.getByBattleAndUser` | `battles` current + `battle_scoreboard_snapshots` / `battle_loot_snapshots` | Future MU achievements / battle contrib (no UI yet) |

Bump **Last reviewed** date to `2026-09-03`.

- [ ] **Step 2: Run broader verification**

Run:
```bash
vp test src/warera/battles.test.ts src/db/battles.test.ts src/db/battle-stats.test.ts src/jobs/battle-info-poll/run.test.ts
vp check
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/warera-api/inventory.md AGENTS.md
git commit -m "docs: inventory battle-info-poll data flow"
```

---

## Spec coverage (self-check)

| Spec requirement | Task |
| --- | --- |
| 15m single job | Task 4 |
| Full getBattles cursor drain | Task 2–4 |
| Filter / sticky by watched MU `muOrders` | Task 4 |
| Light scoreboard from `currentRound` | Task 2–4 |
| No getLiveBattleData | Task 2–4 (not called) |
| End = DB active − complete actives | Task 4 |
| ≥1m settle then getById + final loot | Task 2 constant + Task 4 |
| Loot snapshots; skip not-found | Task 2–4 |
| Schema tables | Task 1 |
| Inventory update | Task 5 |
| No UI | all tasks |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-03-battle-info-poll.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
