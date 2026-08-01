# shadcn Remaining Pages Migration — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation planning  
**Depends on:** [shadcn Site Migration](./2026-08-01-shadcn-site-migration-design.md) (tokens + Economy slice)

## Goal

Finish migrating Calculator, Jobs, Countries, Dashboard, and Shell onto shadcn primitives + Tailwind while preserving the war-command look, then aggressively retire leftover legacy page/shell CSS and temporary token aliases. Behavior (APIs, calculator math, job actions, country CRUD/sync) stays unchanged.

## Decisions

| Topic | Choice |
| --- | --- |
| Scope | All remaining pages + Shell + aggressive CSS/alias cleanup |
| Order | Calculator → Jobs → Countries → Dashboard → Shell → CSS purge |
| Approach | Page-by-page with cleanup of unused rules after each page; final alias purge last |
| Country picker | Combobox (filterable); replace hand-rolled `CountrySelect` |
| Shell nav | `NavigationMenu` with flat links only (no dropdown triggers) |
| Router wiring | `NavigationMenuLink asChild` wrapping TanStack `Link` + `activeProps` |
| Visual fidelity | Preserve war-command look; shadcn is plumbing |
| Cleanup | Aggressive: delete unused class rules and legacy aliases when greps are clean |
| TierPicker | Keep custom tiles/CSS (game art) |

## Page mappings

**Shared page chrome:** Match Economy — bordered `bg-card` panel, `Button size="sm" variant="outline"` for refresh actions, `text-muted-foreground` / `text-destructive` / `font-mono`.

| Page | Becomes |
| --- | --- |
| **Calculator** | `Input` for incl. price; `CountrySelect` → Combobox (flag + name labels, filter, same URL/`onChange` sync); TierPicker unchanged; breakdown → Tailwind flex rows; profit → `text-success` / `text-destructive` |
| **Jobs** | `Table` for jobs and runs; selected row → `bg-primary/15` (or `data-state=selected`); actions → `Button`; job name control → `Button variant="link"` (replaces `.linkish`) |
| **Countries** | `Table` + inline `Input` for edit; add form → `Input`/`Button` (+ `Label` if useful); keep `FlagIcon` |
| **Dashboard** | Tailwind page chrome only (copy unchanged) |
| **Shell** | Header `bg-card border-b border-border`; brand text; `NavigationMenu` / `List` / `Item` / `Link asChild` + TanStack `Link`; active: `text-primary bg-primary/15` (amber wash) |

## Primitives

**Add:** `navigation-menu` via shadcn CLI (move out of literal `@/` if CLI mis-resolves aliases, same as Card/Table).

**Optional:** `label` for form fields.

**Already present:** Button, Input, Table, Badge, Card, Combobox, Separator.

## Country Combobox

Replace `src/web/features/calculator/CountrySelect.tsx` implementation (or rewrite in place) to use existing Combobox primitives:

- Items: countries with flag emoji/label (same labeling as today)
- Filterable popup list
- `value` / `onChange(countryId)` / `disabled` props unchanged for `CalculatorPage`
- Empty state when no countries

Delete `.country-select*` CSS after the swap.

## Shell NavigationMenu

```tsx
<NavigationMenuLink asChild>
  <Link to={…} activeProps={{ className: "…" }} activeOptions={…}>
    {label}
  </Link>
</NavigationMenuLink>
```

Do **not** nest `<a>` inside `<a>`. No `NavigationMenuTrigger` / content panels — five flat section links only. Preserve exact-active behavior for `/`.

## CSS retirement (aggressive)

After pages migrate, remove from `src/web/index.css` when unused:

- Shell/nav: `.shell*`, `.nav-link*`
- Page helpers: `.page*`, `.muted`, `.small`, `.mono`, `.error`
- Jobs/countries tables/forms: `.jobs-table*`, `.actions*`, `.linkish`, `.runs-panel`, `.country-form*`, `.country-select*`
- Calculator chrome (not tiles): `.calc-controls*`, `.calc-breakdown*`, `.calc-row*`, `.calc-details*`, `.profit-positive`, `.profit-negative` (if replaced by Tailwind token classes)
- Legacy aliases: `--bg`, `--panel`, `--raised`, `--text`, `--error` once no `var(--…)` references remain

**Keep:**

- Theme tokens + `@theme` / `.dark` / base layer
- `.tier-tile*` and minimal `.tier-picker` layout needed by TierPicker
- `.item-icon`, `.flag-icon`, `.gold-icon` (and `.icon-label` if still referenced)

## Work order

1. Add `navigation-menu` (+ optional `label`)
2. Calculator — Combobox country + Tailwind/Input; delete country-select CSS
3. Jobs — Table/Button; delete jobs-table/actions/linkish/runs CSS when unused
4. Countries — Table/Input/Button; delete country-form CSS
5. Dashboard — page chrome
6. Shell — NavigationMenu + header Tailwind; delete shell/nav CSS
7. Final greps — purge remaining legacy helpers + aliases; `vp check` / `vp test`; smoke all routes

## Verification

- Visual: all routes still war-command (warm dark, amber active nav, compact density)
- Calculator: tier tiles unchanged; country Combobox filters/selects; URL search sync intact
- Jobs: enable/disable/run/runs panel; selected row wash
- Countries: add/edit/sync behaviors unchanged
- Shell: no nested-anchor warnings; active route highlighted
- `vp check` and `vp test` pass
- Grep: no references to removed legacy classes/aliases

## Non-goals

- Redesign or light mode
- Changing TierPicker art/gradients into shadcn
- New features on any page
- `App*` wrapper layer over shadcn primitives
- Dropdown mega-menus in the shell
