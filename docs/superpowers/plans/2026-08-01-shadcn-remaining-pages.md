# shadcn Remaining Pages Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Calculator, Jobs, Countries, Dashboard, and Shell to shadcn/Tailwind, then aggressively purge leftover legacy CSS and token aliases while preserving war-command look and TierPicker.

**Architecture:** Page-by-page restyle using existing tokens/primitives. Replace `CountrySelect` with Combobox. Wire Shell via `NavigationMenuLink asChild` + TanStack `Link`. Delete unused CSS after each page; final pass removes aliases.

**Tech Stack:** React 19, TanStack Router, shadcn/ui (Combobox, Table, Button, Input, NavigationMenu), Tailwind v4, `vp check` / `vp test`.

**Design:** [2026-08-01-shadcn-remaining-pages-design.md](../specs/2026-08-01-shadcn-remaining-pages-design.md)

## Global Constraints

- Preserve war-command look; no redesign
- Behavior unchanged (APIs, math, CRUD, job actions, URL sync)
- Country picker = Combobox; Shell = NavigationMenu flat links only
- `NavigationMenuLink asChild` → TanStack `Link` (no nested anchors)
- Keep `.tier-tile*` / `.tier-picker` and icon classes (`.item-icon`, `.flag-icon`, `.gold-icon`, `.icon-label` if used)
- If `shadcn add` writes under literal `@/`, move files to `src/components/ui/`
- Prefer `nix develop -c vp check` / `vp test` when `vp` not on PATH
- Commit after each task
- Work on current branch (user may be on `master`)

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/components/ui/navigation-menu.tsx` | Generated NavigationMenu |
| `src/components/ui/label.tsx` | Optional Label |
| `src/web/features/calculator/CountrySelect.tsx` | Combobox country picker |
| `src/web/features/calculator/CalculatorPage.tsx` | Tailwind + Input + CountrySelect |
| `src/web/features/calculator/TierPicker.tsx` | Unchanged (still uses tier CSS) |
| `src/web/features/jobs/JobsPage.tsx` | Table + Button |
| `src/web/features/countries/CountriesPage.tsx` | Table + Input + Button |
| `src/web/features/dashboard/DashboardPage.tsx` | Page chrome |
| `src/web/layout/Shell.tsx` | NavigationMenu header |
| `src/web/index.css` | Tokens + TierPicker + icons; purge rest |

**Shared page wrapper class pattern** (reuse on all pages):

```tsx
className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6"
```

Economy uses `max-w-[1200px]`; other pages historically used `.page` max-width 1100px — keep **1100px** for Calculator/Jobs/Countries/Dashboard.

---

### Task 1: Add NavigationMenu (+ Label)

**Files:**
- Create: `src/components/ui/navigation-menu.tsx`
- Create (optional): `src/components/ui/label.tsx`

**Interfaces:**
- Produces: `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuLink`, `navigationMenuTriggerStyle` (if exported) from `@/components/ui/navigation-menu`

- [ ] **Step 1: Add components**

```bash
nix develop -c pnpm dlx shadcn@latest add navigation-menu label --yes
```

If files appear under `@/components/ui/`, move them:

```bash
mv '@/components/ui/'*.tsx src/components/ui/ 2>/dev/null || true
rm -rf '@' 2>/dev/null || true
```

- [ ] **Step 2: Format + check**

```bash
nix develop -c vp check --fix
nix develop -c vp check
```

Expected: pass (warnings OK).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/navigation-menu.tsx src/components/ui/label.tsx
git commit -m "$(cat <<'EOF'
chore: add shadcn NavigationMenu and Label

EOF
)"
```

---

### Task 2: Calculator — Country Combobox + page restyle

**Files:**
- Modify: `src/web/features/calculator/CountrySelect.tsx`
- Modify: `src/web/features/calculator/CalculatorPage.tsx`
- Modify: `src/web/index.css` (delete `.country-select*` and calculator chrome except tier tiles)

**Interfaces:**
- Consumes: Combobox primitives; `Country` type; `flagEmojiFromIso`
- Produces: `CountrySelect({ countries, value, onChange, disabled? })` unchanged API

- [ ] **Step 1: Rewrite `CountrySelect.tsx` entirely**

```tsx
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { flagEmojiFromIso } from "../../lib/flagEmoji";
import type { Country } from "./types";

type Props = {
  countries: Country[];
  value: string;
  onChange: (countryId: string) => void;
  disabled?: boolean;
};

function labelFor(country: Country): string {
  const flag = flagEmojiFromIso(country.isoCode);
  return flag ? `${flag} ${country.name}` : country.name;
}

export function CountrySelect({ countries, value, onChange, disabled }: Props) {
  const selected = countries.find((c) => c.id === value) ?? null;
  const empty = countries.length === 0;

  return (
    <Combobox
      items={countries}
      value={selected}
      onValueChange={(next) => {
        const country = next as Country | null;
        if (country) onChange(country.id);
      }}
      itemToStringLabel={(item: Country) => labelFor(item)}
      isItemEqualToValue={(a: Country, b: Country) => a.id === b.id}
      disabled={disabled || empty}
    >
      <ComboboxInput
        placeholder={empty ? "No countries" : "Select country"}
        disabled={disabled || empty}
        className="min-w-40 w-full"
        showClear={false}
      />
      <ComboboxContent>
        <ComboboxEmpty>No countries</ComboboxEmpty>
        <ComboboxList>
          {(country: Country) => (
            <ComboboxItem key={country.id} value={country}>
              {labelFor(country)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

If Base UI Combobox requires `itemToStringValue`, add:

```tsx
itemToStringValue={(item: Country) => item.id}
```

If list render API differs from Economy (grouped), match whatever `ComboboxList` children signature Economy uses for flat lists — prefer flat `items={countries}` without groups. Smoke in browser if types complain; adjust to match working Economy Combobox patterns.

- [ ] **Step 2: Restyle `CalculatorPage` return**

Keep all state/handlers. Add imports:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

Replace the JSX return with:

```tsx
  return (
    <section className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Calculator</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refreshScrapPrice()}
          disabled={refreshing || loading}
        >
          Refresh scrap price
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading calculator data…</p> : null}

      {!loading ? (
        <>
          <div className="my-3 flex flex-wrap gap-4">
            <div className="flex w-full flex-col gap-1 text-sm text-muted-foreground">
              <span>Tier</span>
              <TierPicker
                value={tier}
                onChange={(next) =>
                  syncSearch({
                    tier: next,
                    countryId,
                    inclPrice,
                    defaultCountryId,
                  })
                }
              />
            </div>

            <div className="flex min-w-40 flex-col gap-1 text-sm text-muted-foreground">
              <span>Country</span>
              <CountrySelect
                countries={countries}
                value={countryId}
                onChange={(next) => {
                  setCountryIdState(next);
                  syncSearch({
                    tier,
                    countryId: next,
                    inclPrice,
                    defaultCountryId,
                  });
                }}
                disabled={countries.length === 0}
              />
            </div>

            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Incl. price
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={inclPrice}
                onChange={(e) =>
                  syncSearch({
                    tier,
                    countryId,
                    inclPrice: e.target.value,
                    defaultCountryId,
                  })
                }
                placeholder="e.g. 3.9"
                className="min-w-40"
              />
            </label>
          </div>

          {scraps ? (
            <>
              <div className="my-4 grid max-w-md gap-1.5">
                <div className="flex justify-between gap-4">
                  <span>Dismantle value</span>
                  <span className="font-mono">
                    {dismantleValue != null ? formatNum(dismantleValue) : "—"}
                  </span>
                </div>
                {breakdown ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <span>Incl. price</span>
                      <span className="font-mono">{formatNum(breakdown.inclPrice)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Excl. price</span>
                      <span className="font-mono">{formatNum(breakdown.exclPrice)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Profit</span>
                      <span
                        className={
                          breakdown.profit >= 0
                            ? "font-mono font-semibold text-success"
                            : "font-mono font-semibold text-destructive"
                        }
                      >
                        {formatNum(breakdown.profit)}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              <details className="mt-2 max-w-xl">
                <summary className="cursor-pointer text-muted-foreground">
                  Scrap &amp; tax details
                </summary>
                <p className="text-sm text-muted-foreground">
                  Scrap amount: {scrapAmount} · Scrap price: {formatNum(scraps.price)} · Tax:{" "}
                  {(taxRate * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}% ·
                  Fetched: {formatTs(scraps.fetchedAt)}
                  {scraps.stale ? " · Stale (using cached price after refresh failure)" : ""}
                </p>
              </details>
            </>
          ) : !error ? (
            <p className="text-muted-foreground">No scrap price loaded.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
```

- [ ] **Step 3: Delete unused calculator/country-select CSS**

From `src/web/index.css`, remove selectors for: `.country-select*`, `.calc-controls*`, `.calc-breakdown*`, `.calc-row*`, `.calc-details*`, `.profit-positive`, `.profit-negative`.

**Keep** `.tier-picker` and all `.tier-tile*` rules.

- [ ] **Step 4: Verify**

```bash
nix develop -c vp check --fix
nix develop -c vp check
nix develop -c vp test
```

Expected: pass. Manual: `/calculator` — Combobox opens/filters/selects; URL updates; tier tiles look unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/web/features/calculator/CountrySelect.tsx src/web/features/calculator/CalculatorPage.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
feat: migrate Calculator to Combobox and Tailwind

EOF
)"
```

---

### Task 3: Jobs page

**Files:**
- Modify: `src/web/features/jobs/JobsPage.tsx`
- Modify: `src/web/index.css` (remove `.jobs-table*`, `.actions*`, `.linkish`, `.runs-panel` only if Countries no longer needs them — **defer** shared table/actions CSS until after Countries if still referenced)

**Interfaces:**
- Consumes: `Button`, `Table*`

- [ ] **Step 1: Restyle JobsPage**

Add imports for `Button` and `Table*`. Replace return JSX:

```tsx
  return (
    <section className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Jobs</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadJobs()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading jobs…</p> : null}

      {!loading && jobs.length === 0 && !error ? (
        <p className="text-muted-foreground">No jobs registered.</p>
      ) : null}

      {jobs.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Cron</TableHead>
              <TableHead>Last status</TableHead>
              <TableHead>Last started</TableHead>
              <TableHead>Last finished</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const selected = selectedId === job.id;
              const busy = busyId === job.id;
              return (
                <TableRow
                  key={job.id}
                  data-state={selected ? "selected" : undefined}
                  className={selected ? "bg-primary/15" : undefined}
                >
                  <TableCell>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 font-semibold"
                      onClick={() => selectJob(job.id)}
                    >
                      {job.name}
                    </Button>
                    {job.description ? (
                      <div className="text-sm text-muted-foreground">{job.description}</div>
                    ) : null}
                    <div className="font-mono text-sm text-muted-foreground">{job.id}</div>
                  </TableCell>
                  <TableCell>{job.enabled ? "yes" : "no"}</TableCell>
                  <TableCell className="font-mono">{job.cron}</TableCell>
                  <TableCell>{job.lastStatus ?? "—"}</TableCell>
                  <TableCell>{formatTs(job.lastStartedAt)}</TableCell>
                  <TableCell>{formatTs(job.lastFinishedAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void toggleEnabled(job)}
                      >
                        {job.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runNow(job)}
                      >
                        Run now
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => selectJob(job.id)}
                      >
                        {selected ? "Hide runs" : "Runs"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      {selectedId ? (
        <section className="mt-4">
          <h2 className="mb-2 text-[1.05rem] font-semibold">Recent runs — {selectedId}</h2>
          {runsError ? <p className="my-2 text-destructive">{runsError}</p> : null}
          {runsLoading ? <p className="text-muted-foreground">Loading runs…</p> : null}
          {!runsLoading && runs.length === 0 && !runsError ? (
            <p className="text-muted-foreground">No runs yet.</p>
          ) : null}
          {runs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{run.id}</TableCell>
                    <TableCell>{run.status}</TableCell>
                    <TableCell>{formatTs(run.startedAt)}</TableCell>
                    <TableCell>{formatTs(run.finishedAt)}</TableCell>
                    <TableCell>
                      {run.durationMs != null ? `${run.durationMs} ms` : "—"}
                    </TableCell>
                    <TableCell>{run.message ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </section>
      ) : null}
    </section>
  );
```

- [ ] **Step 2: Verify Jobs**

```bash
nix develop -c vp check --fix && nix develop -c vp check && nix develop -c vp test
```

- [ ] **Step 3: Commit**

```bash
git add src/web/features/jobs/JobsPage.tsx
git commit -m "$(cat <<'EOF'
feat: migrate Jobs page to shadcn Table

EOF
)"
```

Do **not** delete `.jobs-table` / `.actions` yet — Countries still uses them until Task 4.

---

### Task 4: Countries page

**Files:**
- Modify: `src/web/features/countries/CountriesPage.tsx`
- Modify: `src/web/index.css` — remove `.jobs-table*`, `.actions*`, `.linkish`, `.runs-panel`, `.country-form*` after migrate

- [ ] **Step 1: Restyle CountriesPage**

Imports: `Button`, `Input`, `Table*`, optionally `Label`.

Replace page chrome, table, and add-form with Tailwind/shadcn equivalents. Preserve all handlers (`handleAdd`, `saveEdit`, `startEdit`, warera “Synced” lock).

Key patterns:

- Page wrapper: same 1100px card panel
- Refresh: `Button outline sm`
- Errors: `text-destructive`
- Edit inputs: `<Input … />`
- Actions: `Button outline sm` for Edit/Save/Cancel
- Add form: `flex flex-wrap items-end gap-3` with labeled `Input`s + submit `Button`
- Flag cell: keep `FlagIcon` + `inline-flex items-center gap-1.5` (or `.icon-label`)
- Editing row: `className="bg-primary/15"` on `TableRow`

Port **all** existing fields and warera vs manual branching — do not drop ISO helper text or sync label.

- [ ] **Step 2: Delete shared legacy CSS now unused**

Grep first:

```bash
rg 'jobs-table|className="actions|linkish|runs-panel|country-form|className="page|className="muted|className="error"' src/web --glob '*.tsx'
```

Remove from `index.css` any selectors with zero TSX hits (expect `.jobs-table*`, `.actions*`, `.linkish`, `.runs-panel`, `.country-form*`).

- [ ] **Step 3: Verify + commit**

```bash
nix develop -c vp check --fix && nix develop -c vp check && nix develop -c vp test
git add src/web/features/countries/CountriesPage.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
feat: migrate Countries page to shadcn Table

EOF
)"
```

---

### Task 5: Dashboard + Shell

**Files:**
- Modify: `src/web/features/dashboard/DashboardPage.tsx`
- Modify: `src/web/layout/Shell.tsx`
- Modify: `src/web/index.css` — remove `.shell*`, `.nav-link*` after Shell migrates

- [ ] **Step 1: Dashboard**

```tsx
export function DashboardPage() {
  return (
    <section className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6">
      <h1 className="m-0 mb-2 text-[1.35rem] font-semibold tracking-tight">Dashboard</h1>
      <p className="m-0 text-muted-foreground">
        Overview placeholder. Use the Jobs tab to list scheduled jobs, toggle them, and inspect
        recent runs.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Rewrite Shell.tsx**

```tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

type ShellProps = {
  children: ReactNode;
};

const tabs = [
  { to: "/", label: "Dashboard" },
  { to: "/jobs", label: "Jobs" },
  { to: "/calculator", label: "Calculator" },
  { to: "/economy", label: "Economy" },
  { to: "/countries", label: "Countries" },
] as const;

export function Shell({ children }: ShellProps) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center gap-6 border-b border-border bg-card px-5 py-3">
        <div className="font-semibold tracking-wide">Warera</div>
        <NavigationMenu viewport={false}>
          <NavigationMenuList className="gap-1">
            {tabs.map((tab) => (
              <NavigationMenuItem key={tab.to}>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <Link
                    to={tab.to}
                    activeOptions={tab.to === "/" ? { exact: true } : undefined}
                    activeProps={{
                      className: cn(
                        navigationMenuTriggerStyle(),
                        "bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary",
                      ),
                    }}
                  >
                    {tab.label}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </header>
      <main className="flex-1 p-5">{children}</main>
    </div>
  );
}
```

If `navigationMenuTriggerStyle` or `viewport` prop does not exist in generated file, adapt to whatever the CLI exported — keep `asChild` + `Link` pattern and amber active classes.

If double `className` on Link/activeProps fights, prefer:

```tsx
activeProps={{
  className: "bg-primary/15 text-primary data-[active=true]:bg-primary/15",
}}
```

and set base muted styles via `navigationMenuTriggerStyle()` on the Link `className` prop.

- [ ] **Step 3: Delete shell/nav CSS**

Remove `.shell`, `.shell-header`, `.shell-brand`, `.shell-nav`, `.nav-link*` from `index.css`.

- [ ] **Step 4: Verify + commit**

```bash
nix develop -c vp check --fix && nix develop -c vp check && nix develop -c vp test
git add src/web/features/dashboard/DashboardPage.tsx src/web/layout/Shell.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
feat: migrate Shell to NavigationMenu and Dashboard chrome

EOF
)"
```

---

### Task 6: Final CSS + alias purge

**Files:**
- Modify: `src/web/index.css`

- [ ] **Step 1: Grep for leftover legacy usage**

```bash
rg 'className="(page|muted|small|mono|error|shell|nav-link|jobs-table|actions|linkish|country-|calc-|profit-)' src/web --glob '*.tsx'
rg 'var\(--(bg|panel|raised|text|error)\)' src/web
```

Expected: no TSX class hits (except possibly none). CSS may still define unused rules / aliases.

- [ ] **Step 2: Purge `index.css`**

Delete remaining unused rules: `.page*`, `.muted`, `.small`, `.mono`, `.error`, any leftover form/table helpers.

Remove legacy aliases from `:root` when unused:

```css
/* delete these if grep shows no var(--bg) etc. */
--bg: var(--background);
--panel: var(--card);
--raised: var(--secondary);
--text: var(--foreground);
--error: var(--destructive);
```

Also remove `--accent-soft` only if unused; Shell/Jobs selection now use `bg-primary/15` — grep first. If still referenced in CSS for something kept, leave it.

**Keep:** imports, `:root` shadcn tokens, app `--success` / `--sans` / `--mono`, `@theme`, `.dark`, `@layer base`, `.tier-picker`, `.tier-tile*`, `.item-icon`, `.flag-icon`, `.gold-icon`, `.icon-label` (if Countries still uses it).

Global `button { font: inherit; cursor: pointer; }` / `button:disabled` — keep unless they conflict with shadcn (usually fine).

- [ ] **Step 3: Full verify**

```bash
nix develop -c vp check
nix develop -c vp test
```

Manual smoke: Dashboard, Jobs, Calculator (Combobox + tiers), Economy, Countries — nav active amber; no broken colors.

- [ ] **Step 4: Commit**

```bash
git add src/web/index.css
git commit -m "$(cat <<'EOF'
chore: purge legacy WebUI CSS and token aliases

EOF
)"
```

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| NavigationMenu + Label | Task 1 |
| Calculator Combobox + Tailwind; TierPicker kept | Task 2 |
| Jobs Table/Button | Task 3 |
| Countries Table/Input/Button | Task 4 |
| Dashboard chrome | Task 5 |
| Shell NavigationMenu + asChild Link | Task 5 |
| Aggressive CSS + alias purge | Tasks 2–6 |
| vp check/test | each task |

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-08-01-shadcn-remaining-pages.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
