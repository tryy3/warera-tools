# Economy UI Enrichment & Country Sync — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation planning  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md), [Calculator Tier/Country UI](./2026-07-31-calculator-tier-country-ui-design.md)

## Goal

Make the Economy tab clearer and more on-brand with WarEra media (item icons, country flags, gold coin), tighten display precision, and stop treating local countries as a hand-maintained tax source of truth. Prefer WarEra `country.getAllCountries` via a daily sync job; keep the Countries tab as a mostly read-only viewer for now.

## Decisions

| Topic | Choice |
| --- | --- |
| Visual scope | Enrich existing Economy layout (icons/flags/coins/rounding); no page redesign |
| Gold coin | Headline gold amounts only (G/day pill, Profit/PP, transfer ~G, opportunities G/PP) |
| Item icons | `https://media.warera.io/images/items/{itemCode}.png?v=33` |
| Country flags | `https://media.warera.io/images/flags/{code}.svg?v=16` (`code` = ISO alpha-2 lowercase in URL) |
| Region → flag | From `region.getById`: use `countryCode` (and `country` id for joins) |
| Number display | Standard round, max 4 decimals, **display/formulas only**; math stays full precision |
| Country storage | Merge into existing `countries` table (not a separate cache) |
| Tax source | WarEra `taxes.market` (percent integer → fraction `/100`); calculator keeps using `taxRate` |
| API-owned fields | name, isoCode, taxRate — not overwritable via PATCH for synced rows |
| Countries tab | Keep; make API-sourced fields read-only; full phase-out later |
| Sync cadence | Daily job `country-sync` (same job runner as `price-poll`) |

## Architecture

```
[country-sync job daily] --> country.getAllCountries
                         --> upsert countries (WarEra _id as PK)

[region fetch in advisor] --> region.getById
                          --> regionName + countryCode (+ country id)

[Economy UI] --> advisor payload (icons/flags via codes)
             --> ItemIcon / FlagIcon / GoldIcon / formatEconomyNumber

[Calculator] --> GET /api/countries (taxRate from synced DB)
[Countries UI] --> list + flags; WarEra rows read-only for synced fields
```

## Data model

### `countries` (extended)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | WarEra `_id` after migration (replace slug ids like `sweden`) |
| `name` | text unique | From API `name` |
| `taxRate` | real | `taxes.market / 100` (e.g. `1` → `0.01`) |
| `isoCode` | text? | Uppercase API `code` (e.g. `SE`) |
| `source` | text | `'warera'` \| `'manual'`; synced rows are `'warera'` |
| `syncedAt` | timestamp? | Last successful upsert from sync (null for manual) |
| `createdAt` / `updatedAt` | timestamp | Unchanged semantics |

**v1 does not store** income/selfWork taxes (available on API; out of scope until calculator needs them).

### ID migration

1. Fetch all WarEra countries.
2. For each existing local row, match by `isoCode` (case-insensitive) or exact `name`.
3. Replace matched rows: new PK = WarEra `_id`, copy/update name, isoCode, taxRate, set `source='warera'`, `syncedAt=now`.
4. Insert any unmatched WarEra countries.
5. Leave unmatched local rows as `source='manual'` (editable).

After the first successful sync, `seed-countries` should not reintroduce slug `sweden` or overwrite synced tax/name/iso. Prefer: seed only when the table is empty, or remove Sweden hard-seed once sync is registered.

Calculator default country: prefer `isoCode === 'SE'` (not hard-coded id `sweden`). URL search param `country` may break for old `sweden` bookmarks after migration — acceptable; document in plan.

### Region fields for Economy

Extend advisor company / switch payloads:

| Field | Source |
| --- | --- |
| `regionCountryCode` | `region.getById` → `countryCode` (lowercase OK; normalize for flag URL) |
| `bestRegionCountryCode` | same for recommended region |

Flag URL builder: `https://media.warera.io/images/flags/${code.toLowerCase()}.svg?v=16`.  
If code missing, omit flag (text only).

## Job: `country-sync`

| Property | Value |
| --- | --- |
| id | `country-sync` |
| default cron | `0 0 0 * * *` (daily midnight) |
| default enabled | true |
| run | `country.getAllCountries` → parse → upsert as above |
| return message | e.g. `synced N countries (updated U, inserted I)` |

Manual trigger via existing Jobs UI “Run now” (same as other jobs). No dedicated `POST /api/countries/sync` in this pass.

On failure: log, mark job run error; do not wipe existing countries.

## API changes

### Countries routes

- `GET /api/countries` — include `source`, `syncedAt`, `isoCode`.
- `PATCH /api/countries/:id` — if `source === 'warera'`, reject changes to `name`, `isoCode`, `taxRate` with `400` (`api_owned_field` or similar). Manual rows unchanged.
- `POST /api/countries` — creates `source='manual'` rows only (slug id as today; do not invent WarEra ids). There is no DELETE route today; none added.

### Economy advisor

- Enrich region resolution to return country codes (extend existing region name cache to store `{ name, countryCode }` from `region.getById`).
- Formula strings produced in `src/economy/profit.ts` (and bonus formulas if they embed long floats) use display rounding ≤4 decimals.

## UI

### Shared web components / helpers

| Piece | Role |
| --- | --- |
| `ItemIcon` | `<img>` from item media URL; empty alt + adjacent text label for a11y |
| `FlagIcon` | `<img>` from flag SVG URL when code present |
| `GoldIcon` | Inline SVG (WarEra coin path + drop-shadow); `aria-hidden` when next to numeric text |
| `formatEconomyNumber` | `toLocaleString` / fixed max 4 fraction digits; shared by Economy UI |
| `wareraFlagUrl` / `wareraItemUrl` | URL builders (version query constants) |

Prefer emoji helper (`flagEmojiFromIso`) remaining for places that already use it; Countries/Economy prefer **image** flags for consistency with WarEra.

### Economy page

- **Material** / opportunity **Item** / best-switch item: item icon + label.
- **Region** / best-switch region: flag + name.
- **Headline gold**: coin icon beside G/day pill, Profit/PP value, transfer gold, G/PP column (not inside formula boxes).
- Formulas: already shown; numbers inside formula text rounded ≤4 decimals at generation time.

### Countries page

- Show flag image from `isoCode`.
- For `source === 'warera'`: display name, ISO, tax as read-only (no edit inputs for those fields).
- Manual rows: keep edit UI.
- Optional muted “Synced from WarEra · {syncedAt}” — nice-to-have, not required.

### Calculator

- Default selection: first country with `isoCode === 'SE'`, else first country.
- Country select keeps existing emoji flags for this pass (Economy/Countries use image flags).

## Display rounding rules

- Apply only when formatting for humans (UI labels and formula strings).
- Cap at **4** fraction digits; omit trailing zeros where `toLocaleString` already does.
- Do **not** change intermediate math in `calculateProfitPerPp` / AE daily value / payback.

## Out of scope

- Removing the Countries tab
- Income / selfWork tax in calculator
- Storing full WarEra country payload (allies, rankings, etc.)
- Economy page layout redesign beyond icon enrichment
- Gold coin inside formula boxes
- Preferring buy/sell book for Profit/PP (unchanged from economy advisor design)

## Testing

- Parse `getAllCountries` sample → `taxRate` / `isoCode` mapping unit tests.
- Upsert/migration: match Sweden by `SE`, end with WarEra id PK and `source='warera'`.
- PATCH rejects tax/name/iso on warera rows; allows on manual.
- Formula builder rounds embedded floats to ≤4 decimals (string assertions).
- Advisor types include country codes when region payload has them (mock `region.getById`).
- URL builders produce expected media paths.
