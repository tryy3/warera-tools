# Calculator Tier & Country UI Polish — Design

**Date:** 2026-07-31  
**Status:** Approved for implementation planning  
**Scope:** Calculator tier picker + country dropdown polish; optional ISO country code for flags  
**Depends on:** [Gear Profit Calculator](./2026-07-31-gear-profit-calculator-design.md)

## Goal

Make Calculator controls easier and more on-brand: replace the tier `<select>` with WarEra-style selectable gear tiles, and show country flags in a custom country dropdown. Support flags via an optional ISO 3166-1 alpha-2 field on countries.

## Decisions

| Topic | Choice |
| --- | --- |
| Approach | Focused UI polish (no shared component library / design-token package) |
| Flag storage | Optional `isoCode` on `countries` (ISO 3166-1 alpha-2, uppercase) |
| Flag rendering | Regional-indicator emoji derived from ISO code in the client |
| Country control | Custom dropdown: closed button + open list, each showing flag + name |
| Tier control | Tall selectable tiles: gradient background, chest icon, scrap-yield footer |
| Tier colors | Made-up gradients for now (can swap to official WarEra colors later) |
| Tier order | Existing `GEAR_TIERS` order: gray → green → blue → purple → yellow → red |
| Chest asset | `https://media.warera.io/images/items/chest.png?v=33` |
| Calc math / scraps API | Unchanged |

## Data model

### `countries.iso_code`

| Column | Type | Notes |
| --- | --- | --- |
| `iso_code` | text, nullable | ISO 3166-1 alpha-2, stored uppercase (`SE`). Null/omit = no flag. |

Validation (create/update):

- Absent or `null` → store `null`
- String → trim, uppercase; must match `/^[A-Z]{2}$/` or 400 `invalid_body`
- Empty string after trim → treat as `null`

Seed:

- New Sweden row includes `isoCode: "SE"`
- Existing Sweden without `isoCode` is backfilled to `"SE"` on seed

JSON field name: `isoCode` (camelCase, matching `taxRate`).

## API

`GET/POST/PATCH /api/countries` expose `isoCode`.

- `POST`: accept optional `isoCode`
- `PATCH`: accept optional `isoCode` (including explicit `null` to clear)
- Empty PATCH that only touches `isoCode` must still update (do not early-return when only `isoCode` is present)

No new endpoints.

## UI

### Tier picker (Calculator)

- Replace tier `<select>` with a horizontal row of 6 buttons (radiogroup semantics: `role="radiogroup"` / `role="radio"` + keyboard left/right optional but click is enough for v1).
- Each tile:
  - Linear gradient background per tier (CSS variables on `:root` or `.tier-tile--{id}`)
  - Chest image centered
  - Footer strip with scrap yield number from `GEAR_TIERS[i].scraps`
  - Selected state: cyan/light ring (as in approved mockup)
- Accessibility: `aria-label` with full tier label (e.g. "Green / Reinforced"); selected via `aria-checked`
- Keep live calc behavior: changing tier updates scrap amount / profit immediately

Suggested made-up gradients (implementer may tune):

| Tier | Gradient (approx) |
| --- | --- |
| gray | `#6b7280` → `#1f2937` |
| green | `#34d399` → `#052e16` |
| blue | `#60a5fa` → `#172554` |
| purple | `#c084fc` → `#3b0764` |
| yellow | `#fbbf24` → `#451a03` |
| red | `#f87171` → `#450a0a` |

### Country select (Calculator)

- Custom dropdown component (no new dependency):
  - Closed: button showing `🇸🇪 Sweden` (or name only if no `isoCode`)
  - Open: listbox of countries with flag + name; click selects and closes
  - Click-outside / Escape closes
  - Disabled when `countries.length === 0`
- Flag helper: `flagEmojiFromIso(isoCode: string): string` using regional indicator symbols; return `""` for invalid/missing

### Countries admin

- Add optional ISO code input on add form and edit row
- Display flag + code (or "—") in the table
- Placeholder e.g. `SE`; hint that it is optional ISO alpha-2

## Layout / files

```
src/
  calculator/
    tiers.ts              # optional: export tier color ids only if needed (colors stay in CSS)
  server/
    iso.ts                # parseIsoCode helper (+ tests)
    routes/countries.ts   # accept/return isoCode
  db/
    schema.ts             # isoCode column
    seed-countries.ts     # SE insert + backfill
  web/
    lib/flagEmoji.ts      # ISO → emoji
    features/calculator/
      TierPicker.tsx
      CountrySelect.tsx
      CalculatorPage.tsx  # wire new controls
      types.ts            # Country.isoCode
    features/countries/
      CountriesPage.tsx   # ISO field
    index.css             # tier tiles + dropdown styles
drizzle/0002_*.sql        # ADD COLUMN iso_code
```

## Out of scope

- Official WarEra color hex values (swap later without API changes)
- Multiple gear type icons (chest only)
- Country delete
- Flag image CDNs / SVG packs
- Redesigning the whole Calculator page chrome

## Testing

- Unit: `parseIsoCode` accept/reject/normalize cases
- Route: POST/PATCH with valid `SE`, invalid `SWE`, clear to null; memory DB table includes `iso_code`
- Seed: Sweden gets `SE` on insert; backfill when null
- Manual: Calculator tier click + country dropdown flag display; Countries admin edit ISO

## Success criteria

1. Calculator tier control is six gradient tiles with chest + scrap footer; selection drives calc.
2. Country control is a custom dropdown with flag when `isoCode` is set.
3. Countries admin can set/clear ISO codes; Sweden seeded/backfilled as `SE`.
