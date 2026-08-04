# Market Opportunities AE6 Rough Daily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich Companies Market opportunities with best-region bonus and rough AE daily gold at fixed AE 6, without changing G/PP sort or Growth/best-switch logic.

**Architecture:** Add a pure `enrichMarketOpportunities` helper in `src/economy/profit.ts`. `buildAdvisor` keeps `listMarketOpportunities` for G/PP ranking, then enriches after the switch scan (so live-fetched recommended regions are available). Companies UI adds two columns and updates the blurb; client `Opportunity` type gains the new fields.

**Tech Stack:** TypeScript, Vitest via `vp test`, React Companies page, Hono advisor JSON (no schema migration).

**Design:** [2026-08-04-market-opportunities-ae-daily-design.md](../specs/2026-08-04-market-opportunities-ae-daily-design.md)

## Global Constraints

- `OPPORTUNITY_REFERENCE_AE = 6` (single exported constant)
- Keep opportunity sort by Profit/PP (do not re-sort by rough daily)
- Missing recommended region or missing/non-finite bonus → `bestBonus` / `roughDailyValue` / region ids/names are `null` (UI `—`); never assume 0% for the daily column
- Do not change Growth `opportunitiesLite` or best-switch selection
- Prefer file-scoped Vitest: `vp test path/to/file.test.ts`
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/economy/profit.ts` | `OPPORTUNITY_REFERENCE_AE`, `MarketOpportunity`, `enrichMarketOpportunities` |
| `src/economy/profit.test.ts` | Unit tests for enrichment |
| `src/economy/index.ts` | Re-export new symbols |
| `src/economy/advisor.ts` | Enrich opportunities after switch scan; return `MarketOpportunity[]` |
| `src/web/features/companies/types.ts` | Extend `Opportunity` |
| `src/web/features/companies/CompaniesPage.tsx` | Table columns + blurb |

---

### Task 1: Pure enrichment helper + tests

**Files:**
- Modify: `src/economy/profit.ts`
- Modify: `src/economy/profit.test.ts`
- Modify: `src/economy/index.ts`

**Interfaces:**
- Consumes: `ProfitPpBreakdown`, `explainAeDaily`
- Produces:
  - `export const OPPORTUNITY_REFERENCE_AE = 6`
  - `export type OpportunityRegionHint = { regionId: string; regionName: string | null; bonus: number | null }`
  - `export type MarketOpportunity = ProfitPpBreakdown & { bestBonus: number | null; bestRegionId: string | null; bestRegionName: string | null; roughDailyValue: number | null; referenceAeLevel: number }`
  - `export function enrichMarketOpportunities(opportunities: ProfitPpBreakdown[], regionsByItem: ReadonlyMap<string, OpportunityRegionHint>): MarketOpportunity[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/economy/profit.test.ts` (keep existing imports; add `enrichMarketOpportunities`, `OPPORTUNITY_REFERENCE_AE`, `explainAeDaily` if not already imported):

```ts
describe("enrichMarketOpportunities", () => {
  const steak: ProfitPpBreakdown = {
    itemCode: "steak",
    marketPrice: 3.7432,
    inputCost: 1.545,
    unitProfit: 2.1982,
    consumedPp: 20,
    profitPerPp: 0.1099,
    missingInputs: [],
    formula: "(3.7432 G − 1.545 G raw) / 20 PP",
  };
  const concrete: ProfitPpBreakdown = {
    itemCode: "concrete",
    marketPrice: 1.6374,
    inputCost: 0.7933,
    unitProfit: 0.8441,
    consumedPp: 10,
    profitPerPp: 0.0844,
    missingInputs: [],
    formula: "(1.6374 G − 0.7933 G raw) / 10 PP",
  };

  it("attaches AE6 rough daily from best-region bonus and keeps G/PP order", () => {
    const regions = new Map([
      ["steak", { regionId: "r1", regionName: "Somewhere", bonus: 0.2 }],
      ["concrete", { regionId: "r2", regionName: "Tehran", bonus: 0.61 }],
    ]);
    const enriched = enrichMarketOpportunities([steak, concrete], regions);
    expect(enriched.map((o) => o.itemCode)).toEqual(["steak", "concrete"]);
    expect(enriched[0]!.referenceAeLevel).toBe(OPPORTUNITY_REFERENCE_AE);
    expect(enriched[0]!.bestBonus).toBe(0.2);
    expect(enriched[0]!.roughDailyValue).toBe(
      explainAeDaily(OPPORTUNITY_REFERENCE_AE, 0.2, 0.1099).dailyValue,
    );
    expect(enriched[1]!.bestBonus).toBe(0.61);
    expect(enriched[1]!.bestRegionName).toBe("Tehran");
    expect(enriched[1]!.roughDailyValue).toBe(
      explainAeDaily(OPPORTUNITY_REFERENCE_AE, 0.61, 0.0844).dailyValue,
    );
    // Stronger bonus can yield higher daily despite lower G/PP
    expect(enriched[1]!.roughDailyValue!).toBeGreaterThan(enriched[0]!.roughDailyValue!);
  });

  it("leaves bonus/daily null when region or bonus is unknown", () => {
    const regions = new Map([
      ["concrete", { regionId: "r2", regionName: "Tehran", bonus: null }],
    ]);
    const enriched = enrichMarketOpportunities([steak, concrete], regions);
    expect(enriched[0]).toMatchObject({
      bestBonus: null,
      bestRegionId: null,
      bestRegionName: null,
      roughDailyValue: null,
      referenceAeLevel: OPPORTUNITY_REFERENCE_AE,
    });
    expect(enriched[1]).toMatchObject({
      bestBonus: null,
      bestRegionId: "r2",
      bestRegionName: "Tehran",
      roughDailyValue: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/economy/profit.test.ts`

Expected: FAIL — `enrichMarketOpportunities` / `OPPORTUNITY_REFERENCE_AE` not exported.

- [ ] **Step 3: Implement helper in `profit.ts`**

Add after `listMarketOpportunities`:

```ts
export const OPPORTUNITY_REFERENCE_AE = 6;

export type OpportunityRegionHint = {
  regionId: string;
  regionName: string | null;
  bonus: number | null;
};

export type MarketOpportunity = ProfitPpBreakdown & {
  bestBonus: number | null;
  bestRegionId: string | null;
  bestRegionName: string | null;
  roughDailyValue: number | null;
  referenceAeLevel: number;
};

export function enrichMarketOpportunities(
  opportunities: ProfitPpBreakdown[],
  regionsByItem: ReadonlyMap<string, OpportunityRegionHint>,
): MarketOpportunity[] {
  return opportunities.map((o) => {
    const region = regionsByItem.get(o.itemCode);
    const bonus = region?.bonus;
    const hasBonus = bonus != null && Number.isFinite(bonus);
    const hasPp = o.profitPerPp != null && Number.isFinite(o.profitPerPp);
    return {
      ...o,
      bestBonus: hasBonus ? bonus : null,
      bestRegionId: region?.regionId ?? null,
      bestRegionName: region?.regionName ?? null,
      roughDailyValue:
        hasBonus && hasPp
          ? explainAeDaily(OPPORTUNITY_REFERENCE_AE, bonus, o.profitPerPp!).dailyValue
          : null,
      referenceAeLevel: OPPORTUNITY_REFERENCE_AE,
    };
  });
}
```

Note on unknown region: when `region` is missing, all of `bestBonus`, `bestRegionId`, `bestRegionName`, `roughDailyValue` are null. When region exists but `bonus` is null, keep `bestRegionId` / `bestRegionName` but null out bonus and daily (matches the second test).

- [ ] **Step 4: Re-export from `src/economy/index.ts`**

```ts
export {
  aeDailyValue,
  calculateProfitPerPp,
  enrichMarketOpportunities,
  explainAeDaily,
  listMarketOpportunities,
  paybackDays,
  transferCostGold,
  OPPORTUNITY_REFERENCE_AE,
  type AeDailyBreakdown,
  type MarketOpportunity,
  type OpportunityRegionHint,
  type ProfitPpBreakdown,
} from "./profit";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp test src/economy/profit.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/economy/profit.ts src/economy/profit.test.ts src/economy/index.ts
git commit -m "$(cat <<'EOF'
feat(economy): enrich market opportunities with AE6 rough daily

EOF
)"
```

---

### Task 2: Wire enrichment in `buildAdvisor`

**Files:**
- Modify: `src/economy/advisor.ts`
- Modify: `src/economy/advisor.test.ts` (assert enriched fields when recommended region is seeded)

**Interfaces:**
- Consumes: `enrichMarketOpportunities`, `MarketOpportunity`, `bestRegionCache` after switch scan
- Produces: `buildAdvisor(...).opportunities: MarketOpportunity[]`

- [ ] **Step 1: Update imports and return type in `advisor.ts`**

Change economy imports to include enrichment:

```ts
import {
  enrichMarketOpportunities,
  explainAeDaily,
  calculateProfitPerPp,
  listMarketOpportunities,
  listProducibleRecipes,
  paybackDays,
  transferCostGold,
  type AeDailyBreakdown,
  type MarketOpportunity,
  type ProfitPpBreakdown,
} from "../economy";
```

Change the return type of `buildAdvisor` so `opportunities` is `MarketOpportunity[]`.

Keep early:

```ts
const opportunitiesBase = listMarketOpportunities(prices);
```

(or keep the name `opportunities` for the base list and reassign after enrichment — pick one style and stick to it).

- [ ] **Step 2: Enrich after the company switch-scan loop**

After the `for (const entry of packEntries)` loop finishes (so `bestRegion` live-fills have run), build a region hint map from `bestRegionCache` and enrich:

```ts
const regionHints = new Map<
  string,
  { regionId: string; regionName: string | null; bonus: number | null }
>();
for (const [itemCode, region] of bestRegionCache) {
  if (region == null) continue;
  regionHints.set(itemCode, {
    regionId: region.regionId,
    regionName: region.regionName,
    bonus: region.bonus,
  });
}
const opportunities = enrichMarketOpportunities(opportunitiesBase, regionHints);
```

If some recipes never entered `bestRegionCache` (e.g. empty pack and no switch loop calls), still enrich from whatever is in the cache; missing keys stay null. To cover the empty-companies case, after building `bestRegionCache` from DB (the loop that sets cache from `recommendedByItem`), that data is already present — enrichment will work even when `packEntries` is empty. Live-fetch for cache misses only happens inside the switch loop; that is acceptable (same as today for switches). Optionally, before enrichment, for any opportunity `itemCode` missing from `bestRegionCache`, `await bestRegion(itemCode)` so the opportunities table fills regions even with zero companies — **do this**:

```ts
for (const o of opportunitiesBase) {
  if (!bestRegionCache.has(o.itemCode)) {
    await bestRegion(o.itemCode);
  }
}
```

Then build `regionHints` and enrich. Place this block after the switch-scan loop (or replace duplicate fetches — if the switch loop already called `bestRegion` for every recipe, the extra loop is a no-op via cache).

- [ ] **Step 3: Return enriched `opportunities`**

Ensure the final return uses the enriched array.

- [ ] **Step 4: Extend an existing warm-cache advisor test**

In `src/economy/advisor.test.ts`, in a test that already seeds `upsertRecommendedRegion` (e.g. iron/steel warm path), after `buildAdvisor`, assert:

```ts
const ironOpp = result.opportunities.find((o) => o.itemCode === "iron");
expect(ironOpp).toMatchObject({
  referenceAeLevel: 6,
  bestBonus: /* the bonus you seeded */,
});
expect(ironOpp?.roughDailyValue).toBe(
  explainAeDaily(6, /* seeded bonus */, ironOpp!.profitPerPp!).dailyValue,
);
```

Import `explainAeDaily` from `./profit` or `../economy` as fits the file. If the warm test seeds steel at a known bonus, assert steel similarly. Also assert opportunities remain sorted by descending `profitPerPp`:

```ts
for (let i = 1; i < result.opportunities.length; i++) {
  expect(result.opportunities[i - 1]!.profitPerPp!).toBeGreaterThanOrEqual(
    result.opportunities[i]!.profitPerPp!,
  );
}
```

- [ ] **Step 5: Run tests**

Run: `vp test src/economy/advisor.test.ts src/economy/profit.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/economy/advisor.ts src/economy/advisor.test.ts
git commit -m "$(cat <<'EOF'
feat(economy): attach region bonus daily to advisor opportunities

EOF
)"
```

---

### Task 3: Companies UI + client types

**Files:**
- Modify: `src/web/features/companies/types.ts`
- Modify: `src/web/features/companies/CompaniesPage.tsx`

**Interfaces:**
- Consumes: enriched `Opportunity` fields from advisor JSON
- Produces: table columns Best bonus + ~G/day (AE6)

- [ ] **Step 1: Extend `Opportunity` in `types.ts`**

```ts
export type Opportunity = {
  itemCode: string;
  marketPrice: number;
  inputCost: number;
  unitProfit: number;
  consumedPp: number;
  profitPerPp: number | null;
  formula: string;
  bestBonus: number | null;
  bestRegionId: string | null;
  bestRegionName: string | null;
  roughDailyValue: number | null;
  referenceAeLevel: number;
};
```

- [ ] **Step 2: Update Market opportunities section in `CompaniesPage.tsx`**

Replace the section blurb and table header/body:

```tsx
<section>
  <h2 className="mt-0 mb-2 text-[1.05rem] font-semibold">Market opportunities</h2>
  <p className="mb-2 text-sm text-muted-foreground">
    Ranked by Profit/PP = (market price − input cost) / consumed PP. ~G/day uses AE{" "}
    {advisor?.opportunities[0]?.referenceAeLevel ?? 6} × each item’s best known region bonus.
  </p>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Item</TableHead>
        <TableHead>G/PP</TableHead>
        <TableHead>Best bonus</TableHead>
        <TableHead>~G/day</TableHead>
        <TableHead>Formula</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {(advisor?.opportunities ?? []).map((o) => (
        <TableRow key={o.itemCode}>
          <TableCell>
            <span className="inline-flex items-center gap-1.5">
              <ItemIcon itemCode={o.itemCode} />
              {formatItem(o.itemCode)}
            </span>
          </TableCell>
          <TableCell className="font-mono">
            <GoldAmount value={o.profitPerPp} digits={4} />
          </TableCell>
          <TableCell
            className="font-mono"
            title={o.bestRegionName ?? o.bestRegionId ?? undefined}
          >
            {o.bestBonus != null && Number.isFinite(o.bestBonus)
              ? `+${formatNum(o.bestBonus * 100, 1)}%`
              : "—"}
          </TableCell>
          <TableCell className="font-mono">
            <GoldAmount value={o.roughDailyValue} digits={2} />
          </TableCell>
          <TableCell className="font-mono text-sm text-muted-foreground">
            {o.formula}
          </TableCell>
        </TableRow>
      ))}
      {!advisor?.opportunities?.length ? (
        <TableRow>
          <TableCell colSpan={5} className="text-muted-foreground">
            No price data yet — refresh prices.
          </TableCell>
        </TableRow>
      ) : null}
    </TableBody>
  </Table>
</section>
```

Use `title` on the bonus cell for region name (v1 hint without an extra column).

- [ ] **Step 3: Typecheck / check**

Run: `vp check`

Expected: PASS (or only pre-existing unrelated issues). Fix any type errors from `Opportunity` widening in fixtures if they fail.

If `src/web/query/loadPlayerData.test.ts` or `fetchAdvisor.test.ts` constructs full `AdvisorResponse` objects and TypeScript complains about missing opportunity fields, add the null/6 defaults to those fixtures:

```ts
bestBonus: null,
bestRegionId: null,
bestRegionName: null,
roughDailyValue: null,
referenceAeLevel: 6,
```

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/types.ts src/web/features/companies/CompaniesPage.tsx
# include any test fixture fixes
git commit -m "$(cat <<'EOF'
feat(web): show best bonus and AE6 daily on opportunities table

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `OPPORTUNITY_REFERENCE_AE = 6` | 1 |
| Enrich with bestBonus / region / roughDaily / referenceAeLevel | 1–2 |
| Null when region/bonus unknown (no fake 0%) | 1 |
| Keep G/PP sort | 1–2 |
| Wire in `buildAdvisor` after recommended regions available | 2 |
| Extend client `Opportunity` | 3 |
| UI columns + blurb | 3 |
| Growth / best-switch unchanged | (non-goals; no tasks touch them) |
| Unit tests for enrichment | 1 |
| Advisor assertion | 2 |
