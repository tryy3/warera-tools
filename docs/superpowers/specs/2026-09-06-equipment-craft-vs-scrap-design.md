# Equipment Craft vs Scrap — Design

**Date:** 2026-09-06  
**Status:** Approved for implementation  
**Related:** [Equipment Market Pricing](./2026-08-05-equipment-market-pricing-design.md), [Gear economy skill](../../.agents/skills/warera-game-mechanics/gear-economy.md)

## Goal

On the Equipment overview page, help decide whether selling scraps or crafting (random or specific) yields more gold — given scraps already owned and steel bought from the market.

## Decisions

| Topic | Choice |
| --- | --- |
| Placement | Top of Equipment overview (above tier item cards) |
| Layout | **A** — cost baseline strip + one comparison table |
| Cost frame | Scraps owned (opportunity = sell at market); steel bought at market |
| Gear proceeds | Seller receive (excl / after country tax) |
| Typical statistic | Median of sale prices (min/max = extremes); not mean |
| Skill bands | Unfiltered — all sales of the item code in the window |
| Random pool | All equipment item codes of the selected tier with ≥1 sale; equal item weight |
| Random UI | Pool summary row + ranked list of specific crafts |
| Architecture | Server domain module + `GET /api/equipment/craft-compare` |
| Default tier | Mythic (`red`) |
| Country | Reuse existing equipment country preference / select |

## Decision frame (gold paths)

1. **Sell scrap** — receive `scrapQty × scrapPrice`
2. **Craft random** — spend scraps + buy `steelRandom` steel; sell resulting gear for seller excl
3. **Craft specific** — spend scraps + buy `steelSpecific` steel; sell that item for seller excl

Compare paths by total gold; report **advantage vs sell-scrap**:

```
advantage = gearExcl − steelCost − scrapValue
```

Positive ⇒ craft beats selling the scraps.

## Craft costs

Separate from dismantle scrap **yields** (e.g. mythic dismantle 1458 vs craft cost 1460).

| Tier id | Label | Scrap | Steel random | Steel specific |
| --- | --- | --- | --- | --- |
| `red` | Mythic | 1460 | 32 | 64 |
| `yellow` | Legendary | 486 | 16 | 32 |
| `purple` | Epic | 162 | 8 | 16 |
| `blue` | Rare | 54 | 4 | 8 |
| `green` | Uncommon | 18 | 2 | 4 |
| `gray` | Common | 6 | 1 | 2 |

Document this table in `gear-economy.md` alongside dismantle yields.

## Formulas

| Quantity | Formula |
| --- | --- |
| `scrapValue` | `scrapQty × scrapPrice` |
| `steelCost` | `steelQty × steelPrice` |
| `excl` (per sale) | `money / (1 + taxRate)` |
| Per item | From window sales: `minExcl`, `medianExcl`, `maxExcl` (null if no trades) |
| Advantage (min/med/max) | `exclStat − steelCost − scrapValue` |

**Random (equal weight over priced items):**

| Field | Definition |
| --- | --- |
| Pool min / max | Min / max of all excl prices across those items’ sales |
| Pool typical | Mean of each item’s `medianExcl` (equal odds per item, not volume-weighted) |
| Steel qty | Random column of the craft table |
| Unpriced items | Still listed under specific with nulls; **excluded** from random pool |

**Sort:** specific rows by median advantage descending; null-median rows at the bottom.

## Architecture

### Domain

`src/equipment/craft.ts` (pure):

- Craft cost constants + lookups by `GearTierId`
- Build compare result from: txs in window, scrap/steel prices, tax rate, tier

**Item enumeration:** Generate the full known set for the tier:
- Armor: `helmet|chest|gloves|pants|boots` + tier digit (`1`…`6` mapped from gray…red)
- Weapon: the single weapon code for that tier from `ITEM_CODE_TIER_OVERRIDES` (e.g. mythic → `jet`)

Sales in the window attach to those codes. Codes with zero trades appear as specific rows with null stats and are excluded from the random pool.

### API

`GET /api/equipment/craft-compare?tier=<GearTierId>&countryId=<id>`

- Reads: latest scrap + steel from `price_snapshots`; `item_market_transactions` since `now - MARKET_WINDOW_MS` (same window as overview); country tax from `countries`
- No new WarEra upstream calls
- Unknown tier → 400
- Missing `countryId` → 400 (excl must be well-defined; UI always sends the selected country)

**Response (conceptual):**

```ts
{
  windowMs: number;
  tier: GearTierId;
  scrapPrice: number | null;
  steelPrice: number | null;
  scrapQty: number;
  steelRandom: number;
  steelSpecific: number;
  scrapValue: number | null;
  steelCostRandom: number | null;
  steelCostSpecific: number | null;
  taxRate: number;
  itemCount: number;
  pricedItemCount: number;
  random: {
    minExcl: number | null;
    medianExcl: number | null; // equal-weight typical
    maxExcl: number | null;
    minAdvantage: number | null;
    medianAdvantage: number | null;
    maxAdvantage: number | null;
    trades: number;
  };
  specific: Array<{
    itemCode: string;
    trades: number;
    minExcl: number | null;
    medianExcl: number | null;
    maxExcl: number | null;
    minAdvantage: number | null;
    medianAdvantage: number | null;
    maxAdvantage: number | null;
  }>;
}
```

### UI

On `EquipmentOverviewPage`, above tier groups:

1. Title **Craft vs scrap**
2. Tier select (default Mythic) + existing country select
3. Baseline strip: sell-scrap gold, unit steel price, craft steel costs (random / specific)
4. Table rows: Sell scrap (baseline Δ = 0), Random, then specifics ranked — columns Min Δ / Med Δ / Max Δ (and optionally trades)
5. Green/red tint for positive/negative advantage
6. Fetch on tier/country change via `/api/equipment/craft-compare`

Optional: persist last tier in local prefs (nice-to-have, not required for v1).

## Edge cases

| Case | Behavior |
| --- | --- |
| Missing scrap or steel price | Costs / advantages null; UI shows `—` |
| No tax / missing country | Require country in UI; API 400 without `countryId` |
| Zero trades for an item | Null stats; sorted last |
| Empty random pool | Random row all `—`; note via `pricedItemCount === 0` |
| Thin markets | Show `trades` so low sample size is visible |

## Docs / inventory

- Update `gear-economy.md` with craft cost table (distinct from dismantle yields)
- Light inventory note: Equipment Market consumers include craft-compare (still Global prices + item-market txs; no new fetch)

## Out of scope

- Skill-band filtering for craft outcomes
- Buying scraps from market (inventory already owned)
- Craft success rate / fail chance (unknown / not modeled)
- New page or nav item
- Changing dismantle yield constants
- Live WarEra craft endpoint calls

## Testing

- Unit: cost table, excl conversion, per-item min/median/max, advantage, random equal-weight typical, sort, empty/partial pools
- Route: happy path; unknown tier 400; missing countryId 400; missing prices → null advantages

## Success criteria

From the Equipment overview, for a chosen tier, the user can see whether selling scraps or crafting (random or a specific item) is better in median terms, with min/max showing downside/upside of gear price luck.
