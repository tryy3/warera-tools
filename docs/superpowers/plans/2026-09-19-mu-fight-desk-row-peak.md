# MU Fight Desk Row Polish + 7d Peak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish Fight Desk rows (Spywera pill under damage, stacked HP/Hunger with both numbers, no skills-reset) and replace “If pill / Full pill-potential” with a 7-day Peak estimate from the highest-ATK snapshot.

**Architecture:** Resolve each member’s peak combat loadout on `GET/POST` fight-desk via a Postgres query (max `atk` in rolling 7d, fallback to latest). API returns `peakFight` inputs; client projects Peak with current knobs using a new Full-pill helper that always applies the +60% ATK bonus and full HP/hunger. Row chrome drops skills-reset and restyles pill/resources.

**Tech Stack:** TypeScript, Hono, Drizzle/Postgres, Vitest via `vp test`, Vite+ (`vp check` / `vp test`), TanStack Query, lucide-react `Pill`, existing `src/fight-damage/` + `src/db/user-fight-state.ts`.

**Design:** [2026-09-19-mu-fight-desk-row-peak-design.md](../specs/2026-09-19-mu-fight-desk-row-peak-design.md)

## Global Constraints

- Client owns damage totals; API returns fight **inputs** (`fight`, `peakFight`), not pre-baked MU sums
- Peak pick = highest `atk` in `recorded_at >= now - 7d`; tie → newest `recorded_at` then highest `id`; cold start / miss → latest snapshot
- Peak projection = Full pill (+60% ATK always) + **full** resources (`hp = maxHp`, `hunger = maxHunger`) + current knobs
- Now projection unchanged (actual pill state + actual resources + ticks)
- Remove skills-reset from Fight Desk UI and from fight-desk response `display` (keep `src/build-class/skills-reset.ts` for other callers)
- Pill UI: Ready muted text; active green + `Pill` icon + timer; debuff red + `Pill` icon + timer
- Prefer `vp test path/to/file.test.ts`; commit after each task
- Note: working tree may already have unrelated WIP under `src/fight-damage/` / `src/warera/fight-state.ts` — do not discard; rebase this work onto those edits or leave them untouched if unrelated

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/fight-damage/player-damage.ts` | Add `withFullResources`, `playerDamageFullPill` |
| `src/fight-damage/player-damage.test.ts` | Full-pill / full-resource tests |
| `src/fight-damage/peak-pick.ts` | Pure `pickHighestAtkSnapshot` |
| `src/fight-damage/peak-pick.test.ts` | Max atk / tie-break / empty |
| `src/fight-damage/aggregate.ts` | Selected Peak sum via `peakFight` map |
| `src/fight-damage/aggregate.test.ts` | Update expectations |
| `src/fight-damage/index.ts` | Re-export new helpers |
| `src/db/user-fight-state.ts` | `listPeakFightStatesForUsers` |
| `src/db/user-fight-state.test.ts` | Peak query + fallback coverage |
| `src/server/routes/mu-fight-desk.ts` | Attach `peakFight`; drop `lastSkillsResetAt` |
| `src/server/routes/mu-fight-desk.test.ts` | Assert peak + omitted reset field |
| `src/web/features/mu/types.ts` | `peakFight`; remove `lastSkillsResetAt` from display |
| `src/web/features/mu/fightDeskMemberRows.ts` | `peakDamage` from `peakFight` |
| `src/web/features/mu/FightDeskMemberRow.tsx` | Row chrome polish |
| `src/web/features/mu/FightDeskMemberRow.test.ts` | Row builder Peak semantics |
| `src/web/features/mu/FightDeskTab.tsx` | Summary label Peak; pass peaks into aggregate |

---

### Task 1: Full-pill damage helper (always bonus + full resources)

**Files:**
- Modify: `src/fight-damage/player-damage.ts`
- Modify: `src/fight-damage/player-damage.test.ts`
- Modify: `src/fight-damage/index.ts` (re-export if not already `export *`)

**Interfaces:**
- Consumes: existing `playerDamageNow`, `PILL_ATK_BONUS`, `FightPlayerInput`, `FightKnobs`
- Produces:
  - `export function withFullResources(input: FightPlayerInput): FightPlayerInput`
  - `export function playerDamageFullPill(input: FightPlayerInput, knobs: FightKnobs): number`

- [ ] **Step 1: Write the failing tests**

Append to `src/fight-damage/player-damage.test.ts`:

```ts
import { playerDamageFullPill, withFullResources } from "./player-damage";

describe("withFullResources", () => {
  it("sets hp and hunger to their maxima", () => {
    expect(withFullResources(player("debuff"))).toMatchObject({
      hp: 100,
      hunger: 100,
      maxHp: 100,
      maxHunger: 100,
    });
  });
});

describe("playerDamageFullPill", () => {
  it("applies pill ATK bonus even when status is debuff", () => {
    const debuff = player("debuff");
    const expected = playerDamageNow(
      withFullResources({ ...debuff, atk: debuff.atk * (1 + 0.6) }),
      knobs,
    );
    expect(playerDamageFullPill(debuff, knobs)).toBeCloseTo(expected);
  });

  it("applies pill ATK bonus when already active", () => {
    const active = player("active");
    const expected = playerDamageNow(
      withFullResources({ ...active, atk: active.atk * (1 + 0.6) }),
      knobs,
    );
    expect(playerDamageFullPill(active, knobs)).toBeCloseTo(expected);
  });

  it("uses full resources, not the snapshot mid-fight bars", () => {
    const midFight = { ...player("ready"), hp: 10, hunger: 0 };
    const full = { ...player("ready"), hp: 100, hunger: 100 };
    expect(playerDamageFullPill(midFight, knobs)).toBeCloseTo(
      playerDamageFullPill(full, knobs),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/fight-damage/player-damage.test.ts`

Expected: FAIL — `withFullResources` / `playerDamageFullPill` not exported

- [ ] **Step 3: Implement**

In `src/fight-damage/player-damage.ts`:

```ts
export function withFullResources(input: FightPlayerInput): FightPlayerInput {
  return {
    ...input,
    hp: input.maxHp,
    hunger: input.maxHunger,
  };
}

export function playerDamageFullPill(input: FightPlayerInput, knobs: FightKnobs): number {
  return playerDamageNow(
    withFullResources({
      ...input,
      atk: input.atk * (1 + PILL_ATK_BONUS),
    }),
    knobs,
  );
}
```

Leave `playerDamageIfPill` in place for now (still used by aggregate until Task 4); do not change its ready-only semantics in this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/fight-damage/player-damage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/fight-damage/player-damage.ts src/fight-damage/player-damage.test.ts
git commit -m "$(cat <<'EOF'
feat: add Full-pill damage helper with full resources

Peak potential must always apply the pill ATK bonus and ignore stale mid-fight HP/hunger.
EOF
)"
```

---

### Task 2: Pure highest-ATK snapshot picker

**Files:**
- Create: `src/fight-damage/peak-pick.ts`
- Create: `src/fight-damage/peak-pick.test.ts`
- Modify: `src/fight-damage/index.ts`

**Interfaces:**
- Consumes: none (generic row shape)
- Produces:
  - `export type PeakAtkCandidate = { atk: number; recordedAt: Date; id?: number }`
  - `export function pickHighestAtkSnapshot<T extends PeakAtkCandidate>(rows: T[]): T | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { pickHighestAtkSnapshot } from "./peak-pick";

describe("pickHighestAtkSnapshot", () => {
  it("returns null for an empty list", () => {
    expect(pickHighestAtkSnapshot([])).toBeNull();
  });

  it("picks the highest atk row", () => {
    const rows = [
      { atk: 100, recordedAt: new Date("2026-09-10T00:00:00.000Z"), id: 1 },
      { atk: 250, recordedAt: new Date("2026-09-11T00:00:00.000Z"), id: 2 },
      { atk: 200, recordedAt: new Date("2026-09-12T00:00:00.000Z"), id: 3 },
    ];
    expect(pickHighestAtkSnapshot(rows)?.id).toBe(2);
  });

  it("breaks atk ties with newer recordedAt then higher id", () => {
    const rows = [
      { atk: 300, recordedAt: new Date("2026-09-12T00:00:00.000Z"), id: 1 },
      { atk: 300, recordedAt: new Date("2026-09-12T00:00:00.000Z"), id: 9 },
      { atk: 300, recordedAt: new Date("2026-09-11T00:00:00.000Z"), id: 5 },
    ];
    expect(pickHighestAtkSnapshot(rows)?.id).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/fight-damage/peak-pick.test.ts`

Expected: FAIL — module missing

- [ ] **Step 3: Implement**

```ts
export type PeakAtkCandidate = {
  atk: number;
  recordedAt: Date;
  id?: number;
};

export function pickHighestAtkSnapshot<T extends PeakAtkCandidate>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => {
    if (row.atk > best.atk) return row;
    if (row.atk < best.atk) return best;
    const timeDiff = row.recordedAt.getTime() - best.recordedAt.getTime();
    if (timeDiff > 0) return row;
    if (timeDiff < 0) return best;
    return (row.id ?? 0) >= (best.id ?? 0) ? row : best;
  });
}
```

Re-export from `src/fight-damage/index.ts`: `export * from "./peak-pick";`

- [ ] **Step 4: Run tests**

Run: `vp test src/fight-damage/peak-pick.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/fight-damage/peak-pick.ts src/fight-damage/peak-pick.test.ts src/fight-damage/index.ts
git commit -m "$(cat <<'EOF'
feat: add highest-ATK snapshot picker for Fight Desk Peak

Cheap heuristic for 7d peak loadout without scoring every snapshot.
EOF
)"
```

---

### Task 3: DB helper — peak fight states for roster users

**Files:**
- Modify: `src/db/user-fight-state.ts`
- Modify: `src/db/user-fight-state.test.ts`

**Interfaces:**
- Consumes: `Db`, `userFightSnapshots`, `pickHighestAtkSnapshot`, `toParsedFightState` (existing private helper)
- Produces:
  - `export const FIGHT_PEAK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000`
  - `export async function listPeakFightStatesForUsers(db: Db, userIds: string[], now?: Date): Promise<Map<string, ParsedFightState>>`

Implementation approach: load candidate rows for `userIds` with `recordedAt >= now - 7d`, group by `userId` in JS, run `pickHighestAtkSnapshot` per group (include `id` + `recordedAt` + `atk`). Return `Map<userId, ParsedFightState>`. Empty `userIds` → empty map.

- [ ] **Step 1: Write the failing DB test**

In `src/db/user-fight-state.test.ts`, import `listPeakFightStatesForUsers` and add:

```ts
it("picks the highest-atk snapshot inside the 7d window per user", async () => {
  await db.insert(schema.mus).values({
    id: "mu-1",
    name: "MU",
    enqueuedAt: new Date("2026-09-15T00:00:00.000Z"),
    fetchedAt: new Date("2026-09-15T00:00:00.000Z"),
  });
  await db.insert(schema.muMembers).values({
    muId: "mu-1",
    userId: "user-1",
    role: "member",
    updatedAt: new Date("2026-09-15T00:00:00.000Z"),
  });

  const now = new Date("2026-09-19T12:00:00.000Z");
  const pollId = await insertUserFightPoll(db, {
    recordedAt: now,
    status: "success",
    userCount: 3,
    muCount: 1,
  });

  await insertUserFightSnapshots(db, pollId, [
    fightRow({
      userId: "user-1",
      muId: "mu-1",
      atk: 100,
      recordedAt: new Date("2026-09-18T10:00:00.000Z"),
      pillStatus: "debuff",
    }),
    fightRow({
      userId: "user-1",
      muId: "mu-1",
      atk: 500,
      recordedAt: new Date("2026-09-17T10:00:00.000Z"),
      username: "PeakFighter",
      pillStatus: "active",
      // force content change so fingerprint allows insert
      armor: 481,
    }),
    fightRow({
      userId: "user-1",
      muId: "mu-1",
      atk: 200,
      recordedAt: new Date("2026-09-19T11:00:00.000Z"),
      armor: 482,
      pillStatus: "ready",
    }),
  ]);

  // Outside window — must not win even with huge atk
  const oldPoll = await insertUserFightPoll(db, {
    recordedAt: new Date("2026-09-01T00:00:00.000Z"),
    status: "success",
    userCount: 1,
    muCount: 1,
  });
  await insertUserFightSnapshots(db, oldPoll, [
    fightRow({
      userId: "user-1",
      muId: "mu-1",
      atk: 9999,
      recordedAt: new Date("2026-09-01T00:00:00.000Z"),
      armor: 999,
    }),
  ]);

  const peaks = await listPeakFightStatesForUsers(db, ["user-1"], now);
  expect(peaks.get("user-1")?.atk).toBe(500);
  expect(peaks.get("user-1")?.username).toBe("PeakFighter");
});
```

Adjust seed details if `insertUserFightSnapshots` fingerprint-dedupes rows — each row needs a distinct fingerprint (vary `armor` / combat fields as above). If the helper inserts only deltas vs latest, insert in chronological order with changing content.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/db/user-fight-state.test.ts`

Expected: FAIL — `listPeakFightStatesForUsers` not exported

- [ ] **Step 3: Implement**

In `src/db/user-fight-state.ts`:

```ts
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { pickHighestAtkSnapshot } from "../fight-damage/peak-pick";

export const FIGHT_PEAK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function listPeakFightStatesForUsers(
  db: Db,
  userIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ParsedFightState>> {
  const out = new Map<string, ParsedFightState>();
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return out;

  const since = new Date(now.getTime() - FIGHT_PEAK_WINDOW_MS);
  const rows = await db
    .select()
    .from(userFightSnapshots)
    .where(
      and(inArray(userFightSnapshots.userId, unique), gte(userFightSnapshots.recordedAt, since)),
    );

  const byUser = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  for (const [userId, list] of byUser) {
    const peak = pickHighestAtkSnapshot(list);
    if (peak) out.set(userId, toParsedFightState(peak));
  }
  return out;
}
```

Ensure imports (`gte`, `inArray`, `ParsedFightState`) are present.

- [ ] **Step 4: Run tests**

Run: `vp test src/db/user-fight-state.test.ts`

Expected: PASS (fix fingerprint/order issues if insert drops rows)

- [ ] **Step 5: Commit**

```bash
git add src/db/user-fight-state.ts src/db/user-fight-state.test.ts
git commit -m "$(cat <<'EOF'
feat: load 7d highest-ATK fight snapshots for Peak

Fight Desk GET can attach peak loadouts without scoring every poll row.
EOF
)"
```

---

### Task 4: Fight-desk API — `peakFight` + drop skills-reset field

**Files:**
- Modify: `src/server/routes/mu-fight-desk.ts`
- Modify: `src/server/routes/mu-fight-desk.test.ts`
- Modify: `src/web/features/mu/types.ts`

**Interfaces:**
- Consumes: `listPeakFightStatesForUsers`, `toFightPlayerInput`, `listLatestFightStatesForMu`
- Produces: each complete member includes `peakFight: FightPlayerInput | null` (non-null when `fight` is non-null: peak map hit, else latest). `display` no longer includes `lastSkillsResetAt`.

- [ ] **Step 1: Update types**

In `src/web/features/mu/types.ts`:

```ts
export type MuFightDeskMember = {
  userId: string;
  username: string | null;
  level: number | null;
  role: string | null;
  incomplete: boolean;
  refreshFailed?: boolean;
  fight: FightPlayerInput | null;
  /** Highest-ATK loadout in 7d (or latest on cold start). Null only when incomplete. */
  peakFight: FightPlayerInput | null;
  display: {
    avatarUrl: string | null;
    militaryRankBonus: number | null;
    ammoLabel: string | null;
    pillLabel: string | null;
    pillEndsAt: string | null;
    skillLevels: Record<string, number>;
  };
};
```

- [ ] **Step 2: Write / extend route test**

Add assertion on an existing seeded GET (or new case): after inserting two snapshots with different `atk`, `GET /mu-1/fight-desk` returns `members[0].peakFight.atk` equal to the higher value, and `display` has no `lastSkillsResetAt` key.

Also assert incomplete members have `peakFight: null`.

- [ ] **Step 3: Run test to verify fail**

Run: `vp test src/server/routes/mu-fight-desk.test.ts`

Expected: FAIL on missing `peakFight` / still-present `lastSkillsResetAt`

- [ ] **Step 4: Implement route wiring**

In `incompleteMember`:

```ts
peakFight: null,
display: { /* without lastSkillsResetAt */ },
```

In `completeMember(snapshot, peakSnapshot, role, refreshFailed)`:

```ts
fight: toFightPlayerInput(snapshot),
peakFight: toFightPlayerInput(peakSnapshot ?? snapshot),
display: {
  avatarUrl: snapshot.avatarUrl,
  militaryRankBonus: snapshot.militaryRankBonus,
  ammoLabel: snapshot.ammoLabel,
  pillLabel: snapshot.pillLabel,
  pillEndsAt: snapshot.pillEndsAt?.toISOString() ?? null,
  skillLevels: snapshot.skillLevels,
},
```

In `respond`, after loading latest snapshots:

```ts
const peakByUserId = await listPeakFightStatesForUsers(
  db,
  roster.map((m) => m.userId),
);
// ...
return snapshot
  ? completeMember(snapshot, peakByUserId.get(member.userId) ?? null, member.role, refreshFailed)
  : incompleteMember(...);
```

- [ ] **Step 5: Run tests**

Run: `vp test src/server/routes/mu-fight-desk.test.ts`

Expected: PASS — update any fixtures that still expect `lastSkillsResetAt`

- [ ] **Step 6: Commit**

```bash
git add src/web/features/mu/types.ts src/server/routes/mu-fight-desk.ts src/server/routes/mu-fight-desk.test.ts
git commit -m "$(cat <<'EOF'
feat: attach peakFight on MU fight-desk API

Return 7d highest-ATK loadouts as inputs and drop skills-reset from the desk payload.
EOF
)"
```

---

### Task 5: Client row math — Peak instead of If-pill

**Files:**
- Modify: `src/web/features/mu/fightDeskMemberRows.ts`
- Modify: `src/web/features/mu/FightDeskMemberRow.test.ts`
- Modify: `src/fight-damage/aggregate.ts`
- Modify: `src/fight-damage/aggregate.test.ts`
- Modify: `src/web/features/mu/FightDeskTab.tsx` (summary wiring only)

**Interfaces:**
- Consumes: `playerDamageNow`, `playerDamageFullPill`, `member.peakFight`
- Produces:
  - `FightDeskMemberRowData.peakDamage: number | null` (rename from `potentialDamage`)
  - `aggregateFightDesk(..., peaksByUserId: ReadonlyMap<string, FightPlayerInput>)` with field `peakPotential` (rename from `fullPillPotential`)

- [ ] **Step 1: Update row builder tests**

In `FightDeskMemberRow.test.ts` / member fixtures, add `peakFight: fight(...)` (can match `fight` for cold start). Change expectations:

```ts
expect(row?.peakDamage).toBeGreaterThan(row?.nowDamage ?? 0); // when peak/full > now
```

For ready mid-resource current + peakFight with higher atk, assert `peakDamage` uses `playerDamageFullPill(peakFight, knobs)`.

Update sort tests: `potential` sort key can remain as id but compares `peakDamage`.

- [ ] **Step 2: Implement `buildFightDeskMemberRows`**

```ts
import { playerDamageFullPill, playerDamageNow } from "../../../fight-damage/player-damage";

export type FightDeskMemberRowData = {
  member: MuFightDeskMember;
  nowDamage: number | null;
  peakDamage: number | null;
  damagePerHit: number | null;
  projected: { hp: number; hunger: number } | null;
};

// incomplete → all nulls
nowDamage: playerDamageNow(member.fight, knobs),
peakDamage: member.peakFight
  ? playerDamageFullPill(member.peakFight, knobs)
  : null,
```

Sort case `"potential"`: compare `peakDamage`.

- [ ] **Step 3: Update aggregate**

```ts
export function aggregateFightDesk(
  players: FightPlayerInput[],
  selectedIds: ReadonlySet<string>,
  knobs: FightKnobs,
  peaksByUserId: ReadonlyMap<string, FightPlayerInput> = new Map(),
): {
  now: number;
  peakPotential: number;
  selectedCount: number;
  avgPerMember: number;
  topDamage: number;
  pillCounts: { active: number; debuff: number; ready: number };
} {
  // ...
  const peakInput = peaksByUserId.get(player.userId) ?? player;
  peakPotential += playerDamageFullPill(peakInput, knobs);
}
```

Update `aggregate.test.ts` accordingly (import `playerDamageFullPill`).

- [ ] **Step 4: Wire FightDeskTab summary**

```ts
const peaksByUserId = useMemo(() => {
  const map = new Map<string, FightPlayerInput>();
  for (const member of query.data?.members ?? []) {
    if (member.peakFight) map.set(member.userId, member.peakFight);
  }
  return map;
}, [query.data?.members]);

const summary = useMemo(
  () =>
    aggregateFightDesk(
      (query.data?.members ?? []).flatMap((m) => (m.fight ? [m.fight] : [])),
      new Set(prefs.selectedUserIds),
      fightKnobs,
      peaksByUserId,
    ),
  [fightKnobs, peaksByUserId, prefs.selectedUserIds, query.data?.members],
);

// SummaryCard label="Peak" value={formatDisplayNumber(summary.peakPotential, 0)}
// Sort option label: Peak
```

Fix any TypeScript breaks from `peakFight` required on fixtures in selection tests if they construct members manually.

- [ ] **Step 5: Run tests**

Run:

```bash
vp test src/web/features/mu/FightDeskMemberRow.test.ts src/fight-damage/aggregate.test.ts src/web/lib/fightDeskSelection.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/web/features/mu/fightDeskMemberRows.ts src/web/features/mu/FightDeskMemberRow.test.ts src/fight-damage/aggregate.ts src/fight-damage/aggregate.test.ts src/web/features/mu/FightDeskTab.tsx src/web/lib/fightDeskSelection.test.ts
git commit -m "$(cat <<'EOF'
feat: project Fight Desk Peak from peakFight inputs

Replace If-pill totals with Full-pill projection of the 7d highest-ATK loadout.
EOF
)"
```

---

### Task 6: Member row UI — Spywera pill, stacked bars, no reset

**Files:**
- Modify: `src/web/features/mu/FightDeskMemberRow.tsx`
- Modify: `src/web/features/mu/FightDeskTab.tsx` (grid/copy only if needed)

**Interfaces:**
- Consumes: `row.peakDamage`, `member.fight.pillStatus`, `member.display.pillEndsAt`, lucide `Pill`
- Produces: updated collapsed row layout

- [ ] **Step 1: Remove skills-reset usage**

Delete imports and calls of `skillsResetStatus`, `resetText`, reset column, and mobile `· ${resetText}` concat.

- [ ] **Step 2: Restyle pill status**

Replace violet glow-dot + free text with Spywera-style line in the damage column:

```tsx
import { ChevronDown, Factory, Pill, Swords } from "lucide-react";

function PillStatusLine({
  fight,
  pillEndsAt,
  nowMs,
}: {
  fight: FightPlayerInput | null;
  pillEndsAt: string | null;
  nowMs: number;
}) {
  if (!fight) return <span className="text-xs text-muted-foreground">Unavailable</span>;
  const timer = formatRemaining(pillEndsAt, nowMs);
  if (fight.pillStatus === "ready") {
    return <span className="text-xs text-muted-foreground">Ready</span>;
  }
  if (fight.pillStatus === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <Pill className="size-3.5" aria-hidden="true" />
        {timer ?? "Active"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
      <Pill className="size-3.5" aria-hidden="true" />
      {timer ?? "Debuff"}
    </span>
  );
}
```

Remove the separate xl pill column if damage stack owns it; tighten grid to drop the reset column:

`xl:grid-cols-[auto_2rem_minmax(10rem,1fr)_minmax(11rem,1fr)_minmax(8rem,auto)_auto]`

(name | resources | damage+pill | expand — plus checkbox/rank)

- [ ] **Step 3: Stack HP/Hunger**

Change the resources container from `grid-cols-2` side-by-side to a single column stack (`flex flex-col gap-2`), keep both `ResourceBar`s with numbers. Prefer HP fill `bg-red-500` and Hunger `bg-emerald-500` to match the approved mock (optional but recommended for scanability).

- [ ] **Step 4: Damage stack**

```tsx
<div className="… xl:text-right">
  <div className="text-[0.65rem] …">Now</div>
  <div className="font-mono text-sm font-semibold text-amber-100 tabular-nums">
    {formatNumber(row.nowDamage)}
  </div>
  {row.peakDamage != null ? (
    <div className="font-mono text-[0.65rem] text-violet-300 tabular-nums">
      Peak {formatNumber(row.peakDamage)}
    </div>
  ) : null}
  <div className="mt-1">
    <PillStatusLine
      fight={fight}
      pillEndsAt={member.display.pillEndsAt}
      nowMs={nowMs}
    />
  </div>
</div>
```

Always show Peak when available (including when already pilled), unlike old “If pill” hide-when-active.

Expanded details: keep Pill line; remove any reset mention; Hunger detail can stay.

- [ ] **Step 5: Smoke-check types / tests**

Run:

```bash
vp test src/web/features/mu/FightDeskMemberRow.test.ts src/fight-damage/aggregate.test.ts
vp check
```

Expected: PASS (fix any format/lint issues)

- [ ] **Step 6: Commit**

```bash
git add src/web/features/mu/FightDeskMemberRow.tsx src/web/features/mu/FightDeskTab.tsx
git commit -m "$(cat <<'EOF'
style: Spywera pill timers and stacked HP/Hunger on Fight Desk

Drop skills-reset chrome; show Peak under Now with compact resource bars.
EOF
)"
```

---

### Task 7: Verification pass

**Files:** none new (docs only if inventory wording must mention Peak — skip unless fight-desk consumer description becomes wrong)

- [ ] **Step 1: Run focused suite**

```bash
vp test \
  src/fight-damage/player-damage.test.ts \
  src/fight-damage/peak-pick.test.ts \
  src/fight-damage/aggregate.test.ts \
  src/db/user-fight-state.test.ts \
  src/server/routes/mu-fight-desk.test.ts \
  src/web/features/mu/FightDeskMemberRow.test.ts
```

Expected: all PASS

- [ ] **Step 2: Run `vp check`**

Expected: format/lint/types clean

- [ ] **Step 3: Manual spot-check (if server running)**

Open watched MU → Fight Desk: stacked bars with both numbers; Ready/green/red pill under damage; Peak secondary; no Reset column; summary card says Peak; morning-style debuff member with low Now and high Peak when history has a high-ATK snapshot.

- [ ] **Step 4: Commit only if Step 1–2 produced fixes**

```bash
git add -A  # only intentional fix files
git commit -m "$(cat <<'EOF'
fix: finish Fight Desk Peak polish verification
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Remove skills-reset from Fight Desk UI | 6 |
| Omit `lastSkillsResetAt` from fight-desk response | 4 |
| Stacked HP/Hunger with both numbers | 6 |
| Spywera pill under damage | 6 |
| Peak replaces If pill / Full pill-potential | 5–6 |
| Highest `atk` in 7d + tie-break | 2–3 |
| Full pill always + full resources | 1 |
| Cold start = latest as peak | 4 (`peakSnapshot ?? snapshot`) |
| Peak on GET via DB helper | 3–4 |
| Summary + sort by Peak | 5 |
| Tests for picker / full-pill / route / rows | 1–5, 7 |
| No battle-damage follow-ups | — (out of scope) |

**Placeholder scan:** none intentional.  
**Type consistency:** `peakFight`, `peakDamage`, `peakPotential`, `playerDamageFullPill`, `listPeakFightStatesForUsers`, `pickHighestAtkSnapshot` used consistently across tasks.
