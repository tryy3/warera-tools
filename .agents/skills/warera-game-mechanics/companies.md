# Companies (factories)

Primary reference: [War Era Wiki — Company](https://warera.wiki/en/company). Also [Country](https://warera.wiki/en/country), [Region](https://warera.wiki/en/region).

Players own **companies** (often called factories). Output is measured in **PP** (Production Points). PP are stored until the owner hits **Produce**, which consumes recipe inputs + PP to make items.

## Obtaining / relocating / retasking

| Action | Cost |
| --- | --- |
| Starter | Free Grain company on join |
| Extra company | 100× Concrete |
| **Change production type** | **5× Concrete** |
| **Move location** (region) | **5× Concrete** |
| Rename | Free (names need not be unique) |
| Downgrade / destroy | 80% of invested materials returned |

Changing type and moving are **separate** costs: retask + relocate = **10× Concrete**.

When comparing profitability as production bonuses / ownership shift, amortize these Concrete costs (at live Concrete price) against the expected gain from a better region or recipe — especially if boosts churn with war or monthly strategic updates.

## Components (not a single “factory level”)

Two upgrade tracks (Steel). Company value rises with upgrades.

### Automated Engine (AE)

Idle PP generation — no player stats or currency consumed.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Steel required | 0 | 20 | 40 | 80 | 160 | 320 | 640 |
| **PP/h** | 1 | 2 | 3 | 4 | 5 | 6 | 7 |

### Storage

Caps stored PP. When full, no more PP until Produce clears storage.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Steel required | 0 | 10 | 20 | 40 | 80 | 160 | 320 |
| PP stored | 200 | 400 | 600 | 800 | 1000 | 1200 | 1400 |

## Production sources (do not mix formulas)

| Source | How PP is made | Cost side |
| --- | --- | --- |
| **AE** | `PP/h = AE level` (1–7), continuous while storage not full | Free (idle) |
| **Self-work** | Owner works; consumes Entrepreneurship | No wage |
| **Employees** | Job offer at Wage/PP; worker spends Energy | Wages + income tax (see below) |

Production bonus (below) applies to **all three** sources.

### AE daily value (idle company)

Planning window is usually 24h. The “level × boost × 24 × Profit/PP” rule is for **AE only**:

```
aePPPerHour     = automatedEngineLevel          # 1..7
effectivePPPerH = aePPPerHour × (1 + bonus)     # bonus as fraction, e.g. 0.35
dailyPP_AE      ≈ effectivePPPerH × 24
dailyValue_AE   ≈ dailyPP_AE × (Profit/PP)
```

Equivalent if `regionBoost` is already a multiplier (e.g. `1.35`):

```
dailyValue_AE ≈ aeLevel × regionBoost × 24 × (Profit/PP)
```

**Profit/PP** = market value of one PP of output (use live prices). Example only: Lead = 1 PP/unit → Profit/PP ≈ lead price.

Storage caps mean AE cannot accumulate past capacity without Produce.

### Employees (different math)

- Owner posts job offer: **Wage/PP** (Coins per PP).
- Work session: **10 Energy** → PP tied to worker’s Production skill.
- Baseline (no Production skill): **12 PP / 10 Energy**.
- Pay flow each work session:
  1. `totalWage = PP_produced × Wage/PP`
  2. Debited from owner (fails if balance would go below 0)
  3. **Income tax** = country’s income-tax % on total wage → country treasury  
     Occupied core region: occupied country hijacks **0.5% of tax per resistance** of the region
  4. Employee receives `totalWage − incomeTax`

Net owner cost per PP ≈ wage (tax is taken from the wage, not paid on top — employee receives less). Owner still pays full `totalWage` before tax split.

Tax rates and who controls the region **change with war / laws** — do not hardcode; use live country/region data (or this app’s country tax table when modeling market VAT separately).

Employee **value** math is roughly: item value from their PP × (1+bonus) minus wage cost — not the AE formula.

## Production bonus (“region boost”)

Wiki name: **Production bonus** (%). Raises PP from AE, self-work, and employees.

**Do not hardcode a static boost table.** Prefer API (`region.*`, `country.*`, `company.*` — see warera-api) for the company’s location. Bonuses shift with ownership/war; strategic/specialization sides are believed to refresh on a longer cadence (~monthly) — treat as volatile and refetch.

### Known components (wiki)

Sources **add** as percentages:

1. **Country / strategic (special) resources** — [Region](https://warera.wiki/en/region) / [Country](https://warera.wiki/en/country)  
   Special resources on owned regions (Lithium, Coal, Diamonds, Uranium, Rare Earths, Gold). Per resource **type**, diminishing copies:

   | Copies owned | Production bonus |
   | --- | --- |
   | 1 | +5% |
   | 2 | +0.5% |
   | 3+ | +0.25% |

2. **Resource deposit** — if the company sits in a region with an **active deposit of the raw material it produces**: **+30%**.

```
productionBonus% ≈ countryStrategicBonus% + depositBonus%   # deposit 0 or 30
```

### Unconfirmed / alternate names

- **Ethics specialization bonus** — mentioned in play discussions; may be a separate or UI-named piece of the country-side bonus. **Unconfirmed** vs wiki’s strategic-resource rules. When unsure, trust **live API values** over reconstructing the %.

## Recipes (wiki)

Raw materials: PP only. Processed: PP + input items.  
**Total PPs to fully produce** includes PP embedded in inputs.

| Item (1×) | Consumed PP | Consumed item | Total PP |
| --- | --- | --- | --- |
| Grain | 1 | — | 1 |
| Limestone | 1 | — | 1 |
| Lead | 1 | — | 1 |
| Petroleum | 1 | — | 1 |
| Mysterious Plant | 1 | — | 1 |
| Iron | 1 | — | 1 |
| Livestock | 20 | — | 20 |
| Fish | 40 | — | 40 |
| Steel | 10 | 10 Iron | 20 |
| Concrete | 10 | 10 Limestone | 20 |
| Oil | 1 | 1 Petroleum | **2** |
| Bread | 10 | 10 Grain | 20 |
| Steak | 20 | 1 Livestock | 40 |
| Cooked Fish | 40 | 1 Fish | 80 |
| Light Ammo | 1 | 1 Lead | 2 |
| Ammo | 4 | 4 Lead | 8 |
| Heavy Ammo | 16 | 16 Lead | 32 |
| Pill | 200 | 200 Mysterious Plant | 400 |

**Oil note:** total is **2 PP** (1 Petroleum + 1 processing), not a 15× petroleum recipe.

Many crafts match `processingPP = input item PP total`; Oil is the small-input exception (1+1).
