# Task 10 report: Member rows + expand breakdown

## Status

Implemented and wired Fight Desk member rows into `FightDeskTab`.

- Added selectable, ranked member rows with level/pill state, build classification, pill/reset
  readiness, projected HP and hunger, current damage, and non-active pill potential.
- Added expandable combat details for attack, military rank bonus, precision, critical stats,
  armor, dodge, hunger, ammo, damage per hit, and pill timing.
- Added Total Now (default), Potential, HP, and Name sorting. Incomplete members stay last and
  cannot be selected.
- Added incomplete and refresh-failed cues and aligned the client response type with the API.
- Persisted expanded rows through the existing Fight Desk preferences.

## Commit

- `39c283c` — `feat: Fight Desk member rows with pill/build cues and expand`

## Verification

- TDD red phase: the new focused suite failed because `FightDeskMemberRow` did not exist.
- Focused tests: 4 passed.
- Related fight/build tests: 23 passed across 8 files.
- Full test suite: 876 passed across 157 files.
- Scoped `vp check` on all 5 touched source/test files: 0 errors, 1 pre-existing
  `react(set-state-in-effect)` warning in `FightDeskTab`.
- Full `vp check` is not clean because four pre-existing files outside this task are not formatted:
  `src/build-class/skills-reset.test.ts`, `src/server/routes/mu-fight-desk.ts`,
  `src/web/lib/fightDeskPrefs.test.ts`, and `src/web/lib/fightDeskSelection.test.ts`.

## Concerns

- The worktree's `node_modules` and `pnpm-lock.yaml` are pre-existing symlinks reported by Git as
  untracked/type-changed. They were intentionally excluded from commits.
