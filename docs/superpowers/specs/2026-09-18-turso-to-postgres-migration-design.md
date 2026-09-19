# Turso → Postgres Migration (Happy Path) — Design

**Date:** 2026-09-18  
**Status:** Approved  
**Depends on / extends:**

- [WarEra Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md) (Turso + Drizzle baseline)
- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (unchanged tier model)
- [Turso Write Reduction](./2026-09-14-turso-write-reduction-design.md) (write hygiene still applies on Postgres)
- Pigsty-managed Postgres on the operator’s server (ops outside this repo)

## Goal

Move the toolkit from Turso (libSQL/SQLite) to self-hosted PostgreSQL while keeping product behavior the same, and pick up Postgres-native types plus precise money handling.

## Non-goals

- Changing formulas, UI rounding policy, or feature behavior beyond type accuracy
- Redesigning client-side calculation architecture (beyond wiring `Decimal` where money already flows)
- Partitioning, payload normalization, dual-write, or keeping Turso as a live fallback
- Auth / BetterAuth
- Converting historical SQLite Drizzle SQL files into Postgres (archive instead)

## Decisions

| Topic | Choice |
| --- | --- |
| Migration style | Happy path: better types during the dialect cutover |
| Money column set | **B** — currency + market prices (not tax_rate, damages, bonus, production) |
| Money in app | **decimal.js** on **server and web**; same logic as today, more accuracy |
| Display rounding | No new API/UI “round to 3dp” policy in this migration |
| Money over the wire | Prefer **string** JSON (e.g. `"12.345"`) so clients `new Decimal(value)` without float parse |
| Cutover | **Maintenance window** — stop app, copy data, point at Postgres, start, verify |
| Drizzle history | Move `drizzle/` → `drizzle-bak/`; regenerate from fresh `0000` |
| Postgres driver | `pg` (node-postgres) Pool + Drizzle PG dialect |
| Config | `DATABASE_URL`; drop `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` |
| Tests | **Testcontainers** Postgres; CI needs Docker |
| Rollback | Leave Turso untouched; revert env + previous build if needed |

## Type mapping

| Concern | Today (SQLite / Turso) | Postgres |
| --- | --- | --- |
| Tables | `sqliteTable` | `pgTable` |
| Autoincrement IDs | `integer` autoincrement | identity / serial |
| Timestamps | `integer` + `timestamp_ms` | `timestamptz` |
| Booleans | `integer` + `boolean` | `boolean` |
| JSON payloads | `text` + `json` | `jsonb` |
| Status fields | unconstrained `text` | `pgEnum` (or check) for known sets |
| Non-money floats | `real` | `double precision` |
| Money (set B) | `real` | `numeric` (e.g. `numeric(20, 6)` — exact precision set in implementation) |

### Money columns → `numeric` ↔ `Decimal`

- `item_market_transactions.money`
- Price snapshots: `market_price`, `buy_min`, `buy_max`, `buy_avg`, `sell_min`, `sell_max`, `sell_avg`
- `donation_snapshots.amount`
- Work-stats `wage` (`company_work_stats`, `worker_work_stats`)
- Battle loot `total_money_from_bounty`, `total_money_from_contract`

### Stay `double precision`

Damages, reputation, wealth, terrain, recommended-region `bonus`, countries `tax_rate`, production totals (`employee_prod`, `total`, AE, …), battle points / damages / `total_dmg`, MU `mercenary_reputation`, and similar non-currency stats.

## Architecture

```
[maintenance window]
  stop WarEra (jobs stop with process)
  → Pigsty Postgres empty DB
  → drizzle migrate (fresh 0000+)
  → download Turso SQLite dump (once)
  → scripts/migrate-turso-to-postgres --sqlite dump.db (local read → write PG + transforms)
  → .env: DATABASE_URL only
  → start WarEra
  → verify health + smoke tools + one job run

[runtime]
  App ──DATABASE_URL──► Pigsty Postgres
  (Turso left intact offline as rollback snapshot)
```

```
[money flow]
  PG numeric
    → server Decimal (decimal.js)
    → domain math (Decimal)
    → API JSON string
    → web Decimal
    → existing UI formatting (unchanged policy)
```

## Components

### 1. Schema & Drizzle

- Rewrite `src/db/schema.ts` for `drizzle-orm/pg-core`
- `drizzle.config.ts`: dialect `postgresql`, credentials from `DATABASE_URL`
- Archive: `drizzle/` → `drizzle-bak/` (keep in repo)
- Generate new `drizzle/0000_*.sql` + journal from the PG schema
- Do not port old SQLite migration SQL

### 2. Runtime client & config

- `src/db/client.ts`: `pg` Pool + `drizzle-orm/node-postgres`
- Replace libSQL migrator with PG migrator in `src/db/migrate.ts`
- Rewrite `src/db/instrument.ts` for PG query logging (keep correlation fields)
- Env: require `DATABASE_URL`; remove Turso vars from `src/config/env.ts`, mask list, Docker example, README
- Remove `@libsql/client` when unused

### 3. Money helpers

- Add `decimal.js` dependency
- Small shared helpers: parse (string/number → `Decimal`), arithmetic wrappers as needed, serialize for DB insert and API JSON (string)
- Drizzle: map money `numeric` columns to `Decimal` (custom type and/or repo-boundary mapping)
- Convert server and web money math call sites to `Decimal` **without changing formulas**
- Inventory any awkward client-only calc paths during implementation; note them — do not block cutover on a broader calc redesign

### 4. Data copy script

One-shot script (`scripts/migrate-turso-to-postgres.ts`):

- Inputs: **local SQLite dump** (`--sqlite <path>` or `SQLITE_SOURCE_PATH`) + `DATABASE_URL` (write). Do **not** read live Turso during cutover (avoids remote read limits); download a dump from Turso first.
- Insert in FK-safe order; preserve integer PKs; **reset sequences** after load
- Transforms: epoch-ms → `timestamptz`, JSON text → `jsonb`, int bool → bool, money real → `numeric`
- Prefer copy **all** tables (including TTL cache / company packs) for behavior parity; cold-miss refill remains fine if some cache rows are skipped later as an option
- Idempotent on empty target (or truncate-and-reload) for dry-runs
- Report: per-table row counts; optional money-column checksums/sums
- Dry-run against a Pigsty staging/dev DB before the real window

### 5. Tests

- Shared Testcontainers helper: start Postgres, run migrations, provide `db`
- Replace ~46 libSQL in-memory/temp-file setups and hand-rolled SQLite `CREATE TABLE` strings
- CI must have Docker
- Money assertions: prefer `Decimal` equality where relevant

### 6. Cutover checklist

1. Stop WarEra server (Croner jobs stop)
2. Download a Turso SQLite dump to the app host (dashboard/CLI) — one download, not live API reads during copy
3. Confirm Pigsty DB reachable from the app host
4. Run app migrations on Postgres
5. Run dump → Postgres copy: `pnpm run migrate:turso-to-postgres -- --sqlite ./turso-backup.db --truncate`; review count/checksum report
6. Switch `.env` to `DATABASE_URL`; remove any leftover Turso vars
7. Start server; check `/api/health`, shell player load, prices / equipment / MU or battle smoke, jobs UI
8. Confirm at least one job run succeeds
9. Keep the SQLite dump (+ Turso) as offline rollback until confidence is high

## Error handling

- Copy script: fail fast on transform/insert errors; print last table/batch context; safe to wipe target and retry
- App boot: refuse to start without `DATABASE_URL`; migration failures remain fatal as today
- No automatic fallback to Turso after cutover

## Testing / verification

- Unit/integration: Testcontainers + existing Vitest suites retargeted to PG
- Dry-run data migration on a non-prod DB
- Post-cutover smoke as in cutover checklist

## Risks

| Risk | Mitigation |
| --- | --- |
| Sequence/ID drift after copy | Explicit `setval` after inserting preserved PKs |
| JSON/timestamp transform bugs | Dry-run + row-count / checksum report |
| Decimal wire/API churn | Money-as-string convention + shared parse helpers |
| Testcontainers slower CI | Reuse container per Vitest file/worker where practical |
| Pigsty connectivity | Validate `DATABASE_URL` from app host before the window |
| Bundle size (decimal.js on web) | Acceptable for accuracy; no native `Decimal` in JS yet (TC39 still early) |

## Implementation order (high level)

1. Archive drizzle SQL; PG schema + fresh migrations + client/env
2. Money helpers + schema numeric/Decimal wiring
3. Retarget tests to Testcontainers; fix compile/test fallout
4. Data copy script + dry-run
5. Docs/Docker; maintenance-window cutover

## Open items for implementation plan

- Exact `numeric(p, s)` for money columns
- Whether money Drizzle mapping is a custom column type vs explicit map in db modules
- Testcontainers reuse strategy under Vitest
- Script CLI flags (dry-run, table filter) if useful

## Implementation notes

### Client-side money math (Task 7)

Domain/DB money is `Decimal`; API JSON money is `string | null` via `serializeMoney` / Decimal `toJSON`. Web wire types use strings; display and charts use `moneyToNumber` / `parseMoney` at the boundary. No new “round to 3dp” display policy.

Files that still do money arithmetic on the client (now via `Decimal` / `parseMoney` / `moneyToNumber` bridges):

- `src/web/features/companies/sessionPrices/effective.ts` — rebuild book prices, recompute opportunity P/L
- `src/web/features/companies/sim/derive.ts` — company-day / portfolio inputs from advisor + book
- `src/web/features/companies/OpportunityItemModal.tsx` — override draft vs live price compare
- `src/web/features/growth/GrowthPage.tsx` — bootstrap prices + profit/PP into growth plan
- `src/web/features/equipment-market/taxExcl.ts` — incl→excl from tax
- `src/web/features/equipment-market/EquipmentOverviewPage.tsx` — scrap floor / seller net
- `src/web/features/equipment-market/EquipmentDetailPage.tsx` — market vs recommend deltas
- `src/web/features/battle-build/useLoadoutQuotes.ts` — sum quoted medians
- `src/web/features/market/MarketPriceChart.tsx` / `EquipmentTrendChart.tsx` / `EquipmentLadderChart.tsx` — chart `number` series only

Narrow number bridges remain in `companyDay` / `skills/income` / growth plan inputs (`toNumber()` at call sites). WarEra ingest parsers still emit `number`; `moneyNumeric.toDriver` / insert helpers coerce with `parseMoney`.
