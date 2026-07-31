# Gear Profit Calculator — Design

**Date:** 2026-07-31  
**Status:** Approved for implementation planning  
**Scope:** WebUI Calculator + Countries admin; scrap price cache; pure profit math  
**Depends on:** [WarEra Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md)

## Goal

Help decide whether to **sell gear on the market** or **dismantle and sell scraps**.

Day-to-day question: given a gear tier and the current market (incl-tax) listing price, how much do I actually receive after tax, and is that better than dismantling?

Break-even listing price is **out of scope** for v1 — lower tiers are often near scrap parity; the useful signal is **how much profit** a listing would yield versus being lazy and dismantling.

## Decisions

| Topic | Choice |
| --- | --- |
| Approach | Thin Hono API + client-side live math (shared pure calc module) |
| UI placement | New top-level tabs: **Calculator**, **Countries** |
| Tax source | Per-country `tax_rate` in DB; Calculator dropdown; default Sweden |
| Countries admin | Minimal CRUD UI on its own tab (no delete in v1) |
| Scrap price | `itemTrading.getPrices` → `scraps`; DB cache TTL 24h + manual refresh |
| Scrap yields | Hard-coded by tier (independent of gear type) |
| Break-even output | Not in v1 |
| Gear type / stats filters | Not in v1 (user looks up market price externally) |

## User workflow

1. Look up the lowest market (incl-tax) price for the gear in-game (optionally filter by stats).
2. Open **Calculator**: select tier + country (Sweden by default), paste incl price.
3. Read breakdown: dismantle value, incl, excl, profit — decide sell vs dismantle.
4. Use **excl** when setting a listing price if tweaking for better stats.
5. Optionally open secondary details to double-check scrap amount / raw scrap price / tax.
6. Manage tax rates on **Countries** when rates change or other countries are needed.

## Architecture

```
[Calculator UI] --GET--> /api/scraps (+ POST refresh)
                --GET--> /api/countries
                locally: calc(tier, inclPrice, taxRate, scrapPrice)

[Countries UI]  --list/create/update--> /api/countries

[Hono] --GET--> WarEra itemTrading.getPrices (via src/warera client)
       --RW---> Turso: countries table + cache (scraps)
```

- Browser talks only to Hono JSON API (existing convention).
- Wire `createWareraClient` into app deps (today constructed at boot but unused by routes).
- Pure formulas live in a shared module with no I/O; unit-tested; used by the WebUI for live updates.

### Layout (new / touched)

```
src/
  calculator/          # pure tier yields + profit formulas (+ tests)
  server/routes/
    scraps.ts
    countries.ts
  web/features/
    calculator/
    countries/
  db/schema.ts         # + countries
```

## Data model

### `countries`

Per-country settings; `tax_rate` is the first field. Table name leaves room for more columns later.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | Stable slug, e.g. `sweden` |
| `name` | text | Display name; unique |
| `tax_rate` | real | Fraction, e.g. `0.01` for 1% |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Seed (migration):** insert Sweden if missing — `{ id: "sweden", name: "Sweden", tax_rate: 0.01 }`.

Calculator default selection: Sweden when present; otherwise first country in list.

No delete in v1 (avoids removing the default while selected). Countries “admin” is create + edit only.

### Scrap yields (hard-coded)

| Tier | Labels | Scraps |
| --- | --- | --- |
| gray | Gray / Basic | 6 |
| green | Green / Reinforced | 18 |
| blue | Blue / Advanced | 54 |
| purple | Purple / Elite | 162 |
| yellow | Yellow / Legendary | 486 |
| red | Red / Mythic | 1458 |

### Scrap cache

- Key: `warera:scraps:price` (exact)
- Payload: `{ price: number, fetchedAt: string }` — `fetchedAt` ISO-8601 string of when WarEra was queried
- TTL: `86400` seconds
- Source: `itemTrading.getPrices` → property `scraps` (allowlisted public tRPC)
- Normal `GET`: use `getOrFetch` (fresh cache or fetch)
- On fetch failure: if an expired/previous cache row exists, return it with `stale: true`; otherwise 502
- `POST .../refresh`: always call WarEra, overwrite cache; on failure same stale/502 rules

## Formulas

Inputs: `scrapPrice`, `scrapAmount`, `inclPrice`, `taxRate`

| Output | Formula | Meaning |
| --- | --- | --- |
| `dismantleValue` | `scrapPrice * scrapAmount` | Pocket value from dismantle → sell scraps |
| `exclPrice` | `inclPrice / (1 + taxRate)` | Seller receive at that incl listing |
| `profit` | `exclPrice - dismantleValue` | Positive ⇒ market beats scrap |

**Worked example (from product discussion):** scrap `0.215`, green (`18`), incl `3.9`, tax `1%`  
→ dismantle `3.870`, excl `3.861`, profit `-0.009` → prefer dismantle.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/scraps` | Return cached scrap price; fetch via WarEra if missing/stale |
| `POST` | `/api/scraps/refresh` | Force refetch, update cache, return fresh payload |
| `GET` | `/api/countries` | List countries |
| `POST` | `/api/countries` | Create country (`id` slugified from name if omitted; validate fields) |
| `PATCH` | `/api/countries/:id` | Update `name` and/or `tax_rate` |

### Validation / errors

Use existing `HttpError` style:

- Invalid JSON / missing fields → 400
- Unknown country → 404
- `tax_rate` finite and in `[0, 1]`
- Duplicate `id` or `name` → 409
- WarEra scrap fetch failure: if any cached scrap row exists (even expired), return it with `stale: true`; if none, 502 with clear message

## WebUI

### Shell

Tabs: Dashboard · Jobs · **Calculator** · **Countries**

Functional admin styling (same shell/CSS language as Jobs). Not a marketing page.

### Calculator

**Inputs:** tier select · country select (default Sweden) · incl-tax market price (number)

**Primary breakdown** (once a valid incl price is present): dismantle value · incl · excl · profit (highlight gain/loss)

**Secondary details** (muted or collapsed): scrap amount for tier, raw scrap price, tax rate used, scrap `fetchedAt`

**Actions:** “Refresh scrap price”

**Empty/invalid price:** still show dismantle value + scrap context; omit excl and profit until incl price is a finite number `> 0`.

No gear-type selector — scrap yield depends only on tier.

### Countries

- Table: name, tax rate (as %), edit
- Add / edit forms: name + tax % (UI edits percent, e.g. `1`; API stores fraction `0.01`)
- No delete in v1
- Calculator refetches countries whenever the Calculator tab becomes active so edits apply

## Testing

- Unit tests for pure calc (including the green-helmet worked example)
- Countries route validation (range, duplicate, 404)
- Scraps route: mock WarEra client; assert cache hit vs force refresh

## Out of scope (v1)

- Break-even minimum listing price
- Automatic market price lookup / gear offer browsing
- Gear type or stat filters
- Inline tax override without changing the country row
- Country delete
- Multi-user auth / per-user preferred country (local default Sweden is enough)
- Syncing tax rates from WarEra API (not known to be available)

## Implementation notes

- Prefer gateway base URL for `itemTrading.getPrices` (cacheable read); fall back to api2 if needed (existing client config).
- Keep Calculator math on the client for snappy typing; do not add a `POST /api/calculator` in v1.
- Extend `createApp` deps with the WarEra client instance used by scrap routes.
