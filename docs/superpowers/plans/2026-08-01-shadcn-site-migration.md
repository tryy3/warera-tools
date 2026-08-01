# shadcn Site Migration (Tokens + Economy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shadcn theme tokens canonical and migrate the Economy page onto shared shadcn primitives while preserving the war-command look.

**Architecture:** Token-first: hex lives on shadcn CSS variables; legacy `--bg` / `--panel` / etc. become aliases; rewrite legacy brand/muted text refs so they do not clobber `--accent` / `--muted`. Install Card, Table, Badge, Separator. Restyle `EconomyPage` with those primitives + Tailwind; delete Economy-only CSS. Leave other pages on aliases.

**Tech Stack:** React 19, Vite+/Tailwind v4, shadcn/ui (`radix-nova`), existing Combobox player search, `vp check` / `vp test`.

**Design:** [2026-08-01-shadcn-site-migration-design.md](../specs/2026-08-01-shadcn-site-migration-design.md)

## Global Constraints

- Preserve war-command look (warm dark `#12100e` / `#1a1714` / `#24201c`, amber `#e8a54b`, success `#6bbf8a`)
- shadcn semantic names are source of truth; no `App*` wrapper layer
- Do **not** alias `--accent` → `--primary` or `--muted` → `--muted-foreground` (would overwrite shadcn tokens)
- Rewrite legacy `var(--accent)` brand uses → `var(--primary)`; legacy muted **text** `var(--muted)` → `var(--muted-foreground)`
- `--radius: 0.375rem`; dark-only; keep Geist
- First slice = tokens + primitives + Economy only (not Calculator/Jobs/Countries/Shell restyle)
- Economy behavior unchanged (advisor API, Combobox search/recent, refresh)
- Prefer `pnpm`; use `./node_modules/.bin/vp` or `vp` for check/test
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/index.css` | Canonical shadcn tokens, legacy aliases, leftover non-Economy page/shell CSS |
| `src/components/ui/card.tsx` | Generated Card primitives |
| `src/components/ui/table.tsx` | Generated Table primitives |
| `src/components/ui/badge.tsx` | Generated Badge |
| `src/components/ui/separator.tsx` | Generated Separator |
| `src/web/features/economy/EconomyPage.tsx` | Economy UI on Card/Table/Button/Badge/Tailwind |
| `src/web/features/economy/EconomyPlayerSearch.tsx` | Unchanged behavior (Combobox) |
| `src/lib/utils.ts` | Existing `cn()` — do not move |

---

### Task 1: Canonical theme tokens + legacy rewrites

**Files:**
- Modify: `src/web/index.css`

**Interfaces:**
- Consumes: current war-command hex values; existing legacy class rules
- Produces: shadcn tokens as hex source of truth; legacy aliases `--bg`, `--panel`, `--raised`, `--text`, `--error`; `--success` + `@theme` `--color-success`; soft `--accent`; no broken `--muted` / `--accent` overwrites

- [ ] **Step 1: Replace the `:root` token block**

Replace the current dual token section at the top of `:root` (app tokens + shadcn map) with this structure. Keep the rest of the file’s class rules for now; only change token definitions, base font/color lines, and the rewrites in later steps.

```css
:root {
  /* shadcn semantic tokens (source of truth) */
  --background: #12100e;
  --foreground: #f0ebe6;
  --card: #1a1714;
  --card-foreground: #f0ebe6;
  --popover: #1a1714;
  --popover-foreground: #f0ebe6;
  --primary: #e8a54b;
  --primary-foreground: #12100e;
  --secondary: #24201c;
  --secondary-foreground: #f0ebe6;
  --muted: #24201c;
  --muted-foreground: #9a9086;
  --accent: #24201c;
  --accent-foreground: #f0ebe6;
  --destructive: #f07178;
  --border: #3a342e;
  --input: #3a342e;
  --ring: #e8a54b;
  --chart-1: #e8a54b;
  --chart-2: #9a9086;
  --chart-3: #6bbf8a;
  --chart-4: #3a342e;
  --chart-5: #24201c;
  --radius: 0.375rem;
  --sidebar: #1a1714;
  --sidebar-foreground: #f0ebe6;
  --sidebar-primary: #e8a54b;
  --sidebar-primary-foreground: #12100e;
  --sidebar-accent: #24201c;
  --sidebar-accent-foreground: #f0ebe6;
  --sidebar-border: #3a342e;
  --sidebar-ring: #e8a54b;

  /* app-only extensions */
  --success: #6bbf8a;
  --accent-soft: rgba(232, 165, 75, 0.16);
  --sans: system-ui, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, Consolas, monospace;

  /* legacy aliases (temporary — do not alias --accent or --muted) */
  --bg: var(--background);
  --panel: var(--card);
  --raised: var(--secondary);
  --text: var(--foreground);
  --error: var(--destructive);

  font: 14px/1.45 var(--sans);
  color: var(--foreground);
  background: var(--background);
  color-scheme: dark;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Rewrite legacy brand + muted-text references**

In `src/web/index.css` class rules (not `@theme`):

1. Replace brand text colors `color: var(--accent)` with `color: var(--primary)` wherever amber brand is intended (nav active, `.linkish`, formula labels/summaries, economy-switch-title). Current hits include approx. lines for `.nav-link.active`, `.linkish`, `.economy-switch-title`, `.formula-details-summary`, `.formula-label`.
2. Replace muted **text** uses `color: var(--muted)` with `color: var(--muted-foreground)` throughout legacy rules (`.muted`, `.nav-link`, form labels, table helpers, etc.).
3. Leave `background: var(--accent-soft)` and border washes that intentionally use amber soft wash alone.
4. Leave `var(--bg)`, `var(--panel)`, `var(--raised)`, `var(--text)`, `var(--error)`, `var(--border)`, `var(--success)` as-is (aliases or shared names).

Do **not** add `--accent: var(--primary)` or `--muted: var(--muted-foreground)`.

- [ ] **Step 3: Fix `@theme inline` muted + success**

In `@theme inline`, change muted surface mapping and add success:

```css
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-success: var(--success);
```

Remove the old comment that said `--color-muted: var(--raised)`. Keep other `--color-*` mappings pointing at shadcn vars.

Also ensure `--font-mono` is available if missing:

```css
  --font-mono: var(--mono);
```

- [ ] **Step 4: Sync `.dark` block**

Update `.dark` so it includes the same shadcn tokens as `:root`, including:

```css
  --muted: #24201c;
  --muted-foreground: #9a9086;
  --accent: #24201c;
  --accent-foreground: #f0ebe6;
  --success: #6bbf8a;
  --border: #3a342e;
```

Keep sidebar / chart / primary values aligned with `:root`.

- [ ] **Step 5: Smoke-check tokens**

Run:

```bash
vp check
```

Expected: pass (CSS-only; no TS changes).

Visually open Dashboard / Jobs / Calculator briefly (or rely on class rules still using aliases): nav active should still be amber (`--primary`), muted labels readable, no pink/wrong hover from clobbered tokens.

- [ ] **Step 6: Commit**

```bash
git add src/web/index.css
git commit -m "$(cat <<'EOF'
refactor: make shadcn theme tokens canonical

EOF
)"
```

---

### Task 2: Add Card, Table, Badge, Separator

**Files:**
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/separator.tsx`
- Possibly modify: `package.json` / lockfile if CLI adds deps

**Interfaces:**
- Consumes: `components.json` aliases (`@/components`, `@/lib/utils`)
- Produces: importable `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Badge`, `Separator` from `@/components/ui/*`

- [ ] **Step 1: Add components via shadcn CLI**

From repo root:

```bash
pnpm dlx shadcn@latest add card table badge separator --yes
```

Confirm files land under `src/components/ui/` (matches existing Button/Combobox). If CLI writes elsewhere, move them to `src/components/ui/` and fix imports.

- [ ] **Step 2: Sanity-import check**

Create no permanent test file. Run typecheck:

```bash
vp check
```

Expected: pass. Spot-check that each new file imports `cn` from `@/lib/utils`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/table.tsx src/components/ui/badge.tsx src/components/ui/separator.tsx package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add shadcn Card Table Badge Separator

EOF
)"
```

(Only stage lockfile/package.json if the CLI changed them.)

---

### Task 3: Restyle Economy page chrome (layout, buttons, table)

**Files:**
- Modify: `src/web/features/economy/EconomyPage.tsx`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`; `Table*` from `@/components/ui/table`; tokens via Tailwind
- Produces: Economy page shell, header actions, search section, opportunities table on shadcn/Tailwind — `CompanyCard` may still use legacy classes until Task 4

- [ ] **Step 1: Add UI imports for this task**

At top of `EconomyPage.tsx`, add only what Task 3 uses:

```tsx
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
```

(Add `Badge` / `Card*` in Task 4.)

- [ ] **Step 2: Replace page shell + header + actions**

Replace the outer return structure (keep state/handlers identical). Target markup:

```tsx
  return (
    <div className="mx-auto max-w-[1200px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-0.5 text-[1.35rem] font-semibold tracking-tight">Economy</h1>
          <p className="m-0 text-muted-foreground">
            AE daily value = AE level × (1 + production bonus) × 24h × Profit/PP. Formulas shown per
            company.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={polling}
          onClick={() => void refreshPrices()}
        >
          {polling ? "Refreshing…" : "Refresh prices"}
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}

      <section className="my-4 flex max-w-md flex-col gap-1.5">
        <label htmlFor="user-search" className="text-sm text-muted-foreground">
          Find player
        </label>
        <EconomyPlayerSearch selectedUserId={selectedUserId} onSelect={selectPlayer} />
      </section>

      {displayName ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-3">
          <p className="m-0 min-w-64 flex-1 text-muted-foreground">
            Showing companies for <strong className="text-foreground">{displayName}</strong>
            {advisor?.recordedAt
              ? ` · prices as of ${new Date(advisor.recordedAt).toLocaleString()}`
              : null}
            {advisor?.companiesFetchedAt
              ? ` · companies as of ${new Date(advisor.companiesFetchedAt).toLocaleString()}`
              : null}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedUserId || refreshingCompanies || loadingAdvisor}
            onClick={() => void refreshCompanies()}
          >
            {refreshingCompanies ? "Refreshing…" : "Refresh companies"}
          </Button>
        </div>
      ) : null}

      {loadingAdvisor ? <p className="text-muted-foreground">Loading advisor…</p> : null}

      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        {/* companies + opportunities sections — see Step 3 */}
      </div>
    </div>
  );
```

Preserve `selectPlayer`, `loadAdvisor`, `refreshPrices`, `refreshCompanies`, and Combobox wiring exactly.

- [ ] **Step 3: Replace opportunities table**

Inside the right column:

```tsx
        <section>
          <h2 className="mb-2 mt-0 text-[1.05rem] font-semibold">Market opportunities</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Ranked by Profit/PP = (market price − input cost) / consumed PP.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>G/PP</TableHead>
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
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {o.formula}
                  </TableCell>
                </TableRow>
              ))}
              {!advisor?.opportunities?.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No price data yet — refresh prices.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </section>
```

Left column can still render `<CompanyCard />` with legacy classes until Task 4; wrap list as:

```tsx
        <section>
          <h2 className="mb-2 mt-0 text-[1.05rem] font-semibold">Companies</h2>
          {!advisor && !loadingAdvisor ? (
            <p className="text-muted-foreground">Search for a player to load companies.</p>
          ) : null}
          {advisor?.companies.length === 0 ? (
            <p className="text-muted-foreground">No companies found for this user.</p>
          ) : null}
          <div className="flex flex-col gap-3">
            {advisor?.companies.map((row) => (
              <CompanyCard key={row.company.id} row={row} />
            ))}
          </div>
        </section>
```

- [ ] **Step 4: Check + smoke**

```bash
vp check
vp test
```

Expected: pass. Manually open `/economy`: page panel looks like before; Refresh buttons are outline/sm; opportunities table renders; Combobox still works.

- [ ] **Step 5: Commit**

```bash
git add src/web/features/economy/EconomyPage.tsx
git commit -m "$(cat <<'EOF'
feat: restyle Economy page chrome with shadcn

EOF
)"
```

---

### Task 4: Restyle CompanyCard + formula helpers

**Files:**
- Modify: `src/web/features/economy/EconomyPage.tsx`

**Interfaces:**
- Consumes: `Card*`, `Badge`, `Separator` from `@/components/ui/*`; `--success` via `text-success`
- Produces: Company cards and formula UI without `.economy-card` / `.pill` / `.formula-*` class dependency

- [ ] **Step 1: Add Card/Badge imports**

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
```

- [ ] **Step 2: Convert FormulaBox / FormulaDetails to Tailwind**

Replace the two helpers:

```tsx
function FormulaBox({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-2 rounded border border-dashed border-primary/35 bg-black/20 px-2.5 py-2">
      <div className="mb-0.5 text-[0.7em] tracking-wider text-primary uppercase">{label}</div>
      <code className="block font-mono text-[0.78em] leading-snug break-words whitespace-pre-wrap text-foreground">
        {children}
      </code>
    </div>
  );
}

function FormulaDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group mt-2 rounded border border-dashed border-primary/35 bg-black/20 px-2.5 py-1.5">
      <summary className="cursor-pointer list-none text-[0.75em] tracking-wider text-primary uppercase [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">▸ </span>
        {label}
      </summary>
      <div className="pb-1 [&_.mt-2:first-child]:mt-1.5">{children}</div>
    </details>
  );
}
```

- [ ] **Step 3: Convert GoldAmount icon wrapper**

```tsx
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoldIcon />
      {prefix}
      {formatDisplayNumber(value, digits)}
      {suffix}
    </span>
  );
```

- [ ] **Step 4: Rewrite CompanyCard with Card + Badge**

Replace the entire `CompanyCard` function with:

```tsx
function CompanyCard({ row }: { row: CompanyAdvisorRow }) {
  const bonusPct = row.company.productionBonus != null ? row.company.productionBonus * 100 : null;

  return (
    <Card className="gap-0 border-border bg-secondary py-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-3.5 pt-3 pb-2">
        <CardTitle className="text-base font-semibold">{row.company.name}</CardTitle>
        <Badge variant="outline" className="border-success/45 font-normal text-success">
          {row.currentDailyValue != null ? (
            <GoldAmount value={row.currentDailyValue} digits={3} prefix="+" suffix="/day" />
          ) : (
            "—"
          )}
        </Badge>
      </CardHeader>

      <CardContent className="px-3.5 pb-3">
        <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3.5 gap-y-1.5">
          <div>
            <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
              Material
            </dt>
            <dd className="mt-0.5 mb-0">
              {row.company.itemCode ? (
                <span className="inline-flex items-center gap-1.5">
                  <ItemIcon itemCode={row.company.itemCode} />
                  {formatItem(row.company.itemCode)}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
              Region
            </dt>
            <dd className="mt-0.5 mb-0">
              <span className="inline-flex items-center gap-1.5">
                <FlagIcon code={row.company.regionCountryCode} />
                {row.company.regionName ?? row.company.regionId ?? "—"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
              AE level
            </dt>
            <dd className="mt-0.5 mb-0">{row.company.aeLevel}</dd>
          </div>
          <div>
            <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
              Bonus
            </dt>
            <dd className="mt-0.5 mb-0">
              {bonusPct != null ? `${formatNum(bonusPct, 1)}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
              Profit/PP
            </dt>
            <dd className="mt-0.5 mb-0">
              <GoldAmount value={row.currentProfitPerPp} digits={4} />
            </dd>
          </div>
          <div>
            <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
              Daily PP
            </dt>
            <dd className="mt-0.5 mb-0">
              {row.aeBreakdown ? formatNum(row.aeBreakdown.dailyPp, 1) : "—"}
            </dd>
          </div>
        </dl>

        {row.bonusDetails || row.profitBreakdown || row.aeBreakdown ? (
          <FormulaDetails label="How calculated">
            {row.bonusDetails ? (
              <FormulaBox label="Production bonus">{row.bonusDetails.formula}</FormulaBox>
            ) : null}
            {row.profitBreakdown ? (
              <FormulaBox label="Profit / PP">{row.profitBreakdown.formula}</FormulaBox>
            ) : null}
            {row.aeBreakdown ? (
              <FormulaBox label="AE / day">{`${row.aeBreakdown.formula} = ${formatNum(row.aeBreakdown.dailyValue, 4)} G`}</FormulaBox>
            ) : null}
          </FormulaDetails>
        ) : null}

        {row.bestSwitch ? (
          <div className="mt-3 border-t border-border pt-2.5">
            <div className="mb-1 text-[0.8em] tracking-wider text-primary uppercase">
              Best switch (raw)
            </div>
            <div className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.95em] leading-snug">
              <span className="text-muted-foreground">→</span>
              <span className="inline-flex items-center gap-1.5">
                <ItemIcon itemCode={row.bestSwitch.itemCode} />
                <strong>{formatItem(row.bestSwitch.itemCode)}</strong>
              </span>
              {row.bestSwitch.bestRegionName || row.bestSwitch.bestRegionId ? (
                <>
                  <span className="text-muted-foreground">@</span>
                  <span className="inline-flex items-center gap-1.5">
                    <FlagIcon code={row.bestSwitch.bestRegionCountryCode} />
                    {row.bestSwitch.bestRegionName ?? row.bestSwitch.bestRegionId}
                  </span>
                </>
              ) : (
                <span>(same region)</span>
              )}
              <span className="text-muted-foreground">
                (+{formatNum(row.bestSwitch.bestBonus * 100, 1)}% bonus)
              </span>
            </div>
            <dl className="mt-1.5 m-0 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-3.5 gap-y-1.5">
              <div>
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Δ / day
                </dt>
                <dd className="mt-0.5 mb-0 text-success">
                  +{formatNum(row.bestSwitch.dailyDelta, 2)} G
                </dd>
              </div>
              <div>
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Transfer
                </dt>
                <dd className="mt-0.5 mb-0 flex flex-col items-start gap-0.5">
                  <span>{row.bestSwitch.transferConcrete} Concrete</span>
                  <span className="text-[0.92em] text-muted-foreground">
                    ~ <GoldAmount value={row.bestSwitch.transferGold} digits={1} />
                  </span>
                </dd>
              </div>
              <div>
                <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">
                  Payback
                </dt>
                <dd className="mt-0.5 mb-0">
                  {row.bestSwitch.paybackDays != null
                    ? `${formatNum(row.bestSwitch.paybackDays, 1)}d`
                    : "—"}
                </dd>
              </div>
            </dl>
            <FormulaDetails label="Switch math">
              <FormulaBox label="Alt Profit / PP">{row.bestSwitch.profitFormula}</FormulaBox>
              <FormulaBox label="Alt AE / day">{row.bestSwitch.aeFormula}</FormulaBox>
              <FormulaBox label="Transfer cost">{row.bestSwitch.transferFormula}</FormulaBox>
              {row.bestSwitch.paybackFormula ? (
                <FormulaBox label="Payback">{row.bestSwitch.paybackFormula}</FormulaBox>
              ) : null}
            </FormulaDetails>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No profitable switch found with current prices.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

Also ensure imports include `Badge`, `Card`, `CardContent`, `CardHeader`, `CardTitle` (Step 1). `Separator` remains unused unless you swap `border-t` for it.

- [ ] **Step 5: Check + visual pass**

```bash
vp check
vp test
```

Expected: pass. On `/economy` with a known player: cards look raised on the page; daily badge green-tinted; formulas expand; best-switch block intact; no leftover dependency on `.economy-card` classes in TSX (grep).

```bash
rg 'economy-card|formula-box|className="pill|className="btn|economy-table' src/web/features/economy
```

Expected: no matches (or only comments).

- [ ] **Step 6: Commit**

```bash
git add src/web/features/economy/EconomyPage.tsx
git commit -m "$(cat <<'EOF'
feat: migrate Economy company cards to shadcn Card

EOF
)"
```

---

### Task 5: Remove Economy-only CSS + final verification

**Files:**
- Modify: `src/web/index.css`

**Interfaces:**
- Consumes: Economy page fully on Tailwind/shadcn
- Produces: `index.css` without unused `.economy-*`, `.formula-*`, `.btn`, `.pill`, `.positive-pill`, `.error-text`, `.icon-label` **if** nothing else references them

- [ ] **Step 1: Confirm safe deletions**

```bash
rg 'economy-|formula-|className="btn"|className="pill|error-text|icon-label|positive-pill|className="positive"' src/web --glob '*.tsx'
```

Delete CSS rules only when TSX no longer references them. Keep `.page`, shell, jobs, calculator, country-select, tier-tile rules.

Likely removable block in `index.css` (approx. current ranges): from `.economy-page` through `.positive-pill`, plus `.btn` / `.error-text` if unused, plus `.formula-*`, plus `.icon-label` if inlined everywhere. **Keep** `.item-icon`, `.flag-icon`, `.gold-icon` if those components still use them.

- [ ] **Step 2: Delete unused rules**

Remove the confirmed unused selectors from `src/web/index.css`. Do not remove shell/nav/jobs/calculator/countries rules.

- [ ] **Step 3: Full verify**

```bash
vp check
vp test
```

Expected: all pass.

Manual smoke:

1. `/economy` — search Combobox (Recent + Results), select player, cards + opportunities, refresh prices/companies, formula drawers
2. `/` `/jobs` `/calculator` `/countries` — colors still war-command via aliases (amber active nav, dark panels)

- [ ] **Step 4: Commit**

```bash
git add src/web/index.css
git commit -m "$(cat <<'EOF'
chore: remove unused Economy legacy CSS

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| shadcn tokens canonical + war-command hex | Task 1 |
| Soft `--accent`; no `--accent` alias; rewrite brand refs | Task 1 |
| `--muted` surface vs text collision handled (rewrite, no clobber) | Task 1 |
| `--radius: 0.375rem`, `--success` in `@theme`, Geist, dark-only | Task 1 |
| Legacy aliases for unmigrated pages | Task 1 |
| Add Card, Table, Badge, Separator | Task 2 |
| Economy → Button / Card / Table / Badge / Tailwind | Tasks 3–4 |
| Keep Combobox / advisor behavior | Tasks 3–4 (no logic changes) |
| Formula helpers stay local, token-styled | Task 4 |
| Raised cards on page panel | Task 4 (`bg-secondary` on `bg-card`) |
| Remove Economy-only CSS | Task 5 |
| Verify + other routes smoke | Tasks 1, 3–5 |
| Out of scope later pages | Not scheduled |

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-01-shadcn-site-migration.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
