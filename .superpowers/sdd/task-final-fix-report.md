# Task Final Fix Report — code review findings (feat/equipment-craft-vs-scrap)

Date: 2026-09-06

## Findings fixed

### 1. AbortError logged as error in `api()`

**File:** `src/web/api.ts`

**Change:** In the catch block, detect `AbortError` (`DOMException` or `Error` with `name === "AbortError"`) and rethrow without calling `webLogger.error`. Other non-`ApiError` failures still log at error level.

**Test:** Extended `src/web/api.test.ts` with `rethrows AbortError without error logging` — mocks fetch abort, asserts `webLogger.error` is not called and the same `AbortError` propagates.

### 2. Local GEAR_TIERS Set shadows calculator export

**File:** `src/server/routes/equipment.ts`

**Change:** Replaced hardcoded `Set` with:

```ts
import { GEAR_TIERS, type GearTierId } from "../../calculator";
const GEAR_TIER_IDS = new Set(GEAR_TIERS.map((t) => t.id));
```

Validation uses `GEAR_TIER_IDS.has(tierRaw)`; `GearTierId` cast unchanged.

## Commands and results

```bash
cd /home/tryy3/src/warera
./node_modules/.bin/vpr test --exclude '.worktrees/**' src/web/api.test.ts src/server/routes/equipment.test.ts
```

```
 Test Files  2 passed (2)
      Tests  14 passed (14)
   Duration  593ms
```

Exit code: 0

## Commit

```
b65329237f293c5cd9e05e09c06fc7e79858123b fix: silence AbortError in api() and reuse calculator GEAR_TIERS
```

# Final review fixes — feat/skills-battle-build

## 2026-09-06

- Added aliases for alternate fight-skill API keys while preserving canonical `FightSkillId` values and canonical-key precedence.
- Added unit coverage for alias mapping and canonical-over-alias behavior.
- Kept Economy and Battle tab panels mounted and hid only the inactive panel, preserving drafts across tab switches.
- Changed the Economy draft remount key to player identity so same-player refreshes do not discard edits.
- Replaced the permanent Battle loading header with “Battle build”.
- Removed the unused `emptyFightLevels` test import.
- Verification: `PATH="$PWD/node_modules/.bin:$PATH" vp test --dir src src/battle-build src/web/features/skills src/web/features/battle-build src/web/lib/skillsSearch.test.ts` — 8 files passed, 39 tests passed.
