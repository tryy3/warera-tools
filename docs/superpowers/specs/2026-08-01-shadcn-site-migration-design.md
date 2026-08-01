# shadcn Site Migration — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation planning  
**Depends on:** [War-Command Dark Theme](./2026-07-31-war-command-dark-theme-design.md), [Economy Player Combobox (shadcn)](./2026-08-01-economy-player-combobox-shadcn-design.md)

## Goal

Make shadcn the proper WebUI foundation—canonical theme tokens and shared primitives—then migrate the Economy page onto those primitives while preserving the war-command look (warm dark neutrals, amber brand, compact density). Behavior (APIs, routing, advisor math) stays unchanged.

## Decisions

| Topic | Choice |
| --- | --- |
| Migration style | Page-by-page after a shared foundation |
| First shippable slice | Token unification + shared primitives + full Economy restyle |
| Later page order | Calculator → Jobs → Countries → Dashboard / Shell |
| Visual fidelity | Preserve war-command look; shadcn is plumbing, not a redesign |
| Token source of truth | shadcn semantic names (`--background`, `--primary`, …); app-only vars where no equivalent |
| Legacy tokens | Temporary aliases until unmigrated CSS is gone |
| Approach | Token-first, then install primitives, then Economy swap |
| Wrappers | No `AppButton` / design-system layer; use `src/components/ui/*` directly |
| Fonts | Keep Geist (already bootstrapped) as UI sans |
| Mode | Dark-only; no light/dark toggle |

## First slice — in / out

**In**

- Canonical shadcn token setup with war-command hex values
- Legacy aliases so Calculator / Jobs / Countries / Shell keep working
- Install primitives needed by Economy: Card, Table, Badge, Separator (Alert / Collapsible only if used)
- Restyle Economy (`EconomyPage` and local pieces) onto Card / Table / Button / Badge / Tailwind
- Remove Economy-only legacy CSS once unused
- Keep Combobox player search as already shipped

**Out (later slices under the same direction)**

- Calculator (including CountrySelect → Select / Combobox)
- Jobs, Countries, Dashboard restyles
- Shell / nav → Tabs or NavigationMenu
- Retiring all legacy aliases
- Deleting global page / shell CSS wholesale
- TierPicker / game art tiles
- Light mode, new Economy features, visual redesign

## Theme & tokens

### Source of truth

Hex and semantic meaning live on **shadcn tokens** in `:root` (and `.dark` kept in sync). New and migrated code prefers Tailwind utilities (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`, …) or `var(--background)`—not `--bg` / `--panel`.

### Palette (look preserved)

| Role | shadcn token | Value |
| --- | --- | --- |
| App chrome | `--background` | `#12100e` |
| Primary text | `--foreground` | `#f0ebe6` |
| Panels / page / popovers | `--card` / `--popover` | `#1a1714` |
| Raised controls / secondary | `--secondary` | `#24201c` |
| Muted surface (hover wash) | `--muted` | `#24201c` |
| Secondary text | `--muted-foreground` | `#9a9086` |
| Brand / links / focus | `--primary` / `--ring` | `#e8a54b` |
| On-primary | `--primary-foreground` | `#12100e` |
| Error | `--destructive` | `#f07178` |
| Borders / inputs | `--border` / `--input` | `#3a342e` |

**`--accent` (shadcn):** Soft interactive surface aligned with secondary / raised (`#24201c`), with `--accent-foreground` = `--foreground`. Amber brand stays on `--primary` only. Correct the current dual-amber mapping in this slice.

**Do not alias legacy `--accent` → `--primary`.** That would overwrite the shadcn `--accent` surface token. As part of the token step, rewrite legacy brand uses of `var(--accent)` to `var(--primary)` (nav active text, formula labels, `.linkish`, etc.). Keep `--accent-soft` as the amber wash helper until those call sites move to `bg-primary/15`.

**Radius:** Set `--radius` to `0.375rem` (6px) to match current `.page` chrome; avoid the softer stock shadcn default.

### App-only extensions

Keep only where shadcn has no clear equivalent:

| Token | Role |
| --- | --- |
| `--success` | Positive profit / positive pills (`#6bbf8a`); expose via `@theme` as `text-success` / `border-success` |
| `--accent-soft` | Amber wash for selected rows / active nav until those use `bg-primary/15` (or similar) |
| Mono stack | `--font-mono` (or `--mono` aliased) for formulas and IDs |

### Legacy aliases (temporary)

Unmigrated CSS keeps working:

```css
--bg: var(--background);
--panel: var(--card);
--raised: var(--secondary);
--text: var(--foreground);
--muted: var(--muted-foreground); /* legacy = text color */
--error: var(--destructive);
/* no --accent alias — see accent rewrite above */
```

**`--muted` name collision:** Legacy `var(--muted)` means muted **text**. Tailwind `bg-muted` uses `--color-muted` mapped to the muted **surface**. Document this; do not “fix” by making both the same.

Base `:root` / `body` styles should prefer `bg-background text-foreground` (or equivalent token refs) over baking `var(--text)` / `var(--bg)` as the long-term base.

## Primitives

**Already present:** Button, Input, Textarea, InputGroup, Combobox.

**Add via shadcn CLI for this slice:** Card, Table, Badge, Separator.

**Optional:** Alert (page errors), Collapsible (formula details)—only if they replace current markup cleanly.

Paths stay under `src/components/ui/` per `components.json`. Prefer `size="sm"` Buttons to match compact toolbars.

## Economy component mapping

| Current | Becomes |
| --- | --- |
| `.btn` / header actions | `Button` (`outline` / `secondary` for chrome) |
| `.economy-card` | `Card` (+ Header / Title / Content) |
| `.pill` / `.positive-pill` | `Badge` (`outline` + success tint) |
| `.economy-table` | `Table` compounds |
| `.error-text` | `text-destructive` or `Alert` |
| `.muted` | `text-muted-foreground` |
| `.mono` | `font-mono` |
| Player search | Existing Combobox (unchanged behavior) |
| `.page` / grid / headers | Tailwind layout (`max-w-*`, `grid`, `gap-*`, `border`, `bg-card`, `rounded-*`) |

**Stay custom (domain):**

- `FormulaBox` / `FormulaDetails` — local components styled with tokens (`border-primary/35`, `font-mono`, `text-primary` labels)
- `GoldIcon` / `ItemIcon` / `FlagIcon` / `GoldAmount` — behavior unchanged; Tailwind for spacing
- Best-switch summary — text + Badge / icons composition; avoid nested Cards unless hierarchy needs it

**Surface hierarchy:** Company cards should still read as raised on the page panel—e.g. card content on `bg-secondary` (or equivalent) over page `bg-card`, matching today’s raised-on-panel look.

**Shell / nav:** Not restyled in this slice beyond continuing to consume tokens through legacy aliases.

## Work order

1. **Tokens** — Reorder `src/web/index.css`: shadcn vars hold hex; legacy aliases; fix accent vs primary; add `--success` to `@theme`; Geist + dark-only.
2. **Primitives** — `shadcn add` Card, Table, Badge, Separator (+ optional Alert / Collapsible if used).
3. **Economy restyle** — Migrate `EconomyPage` (and small locals) to primitives + Tailwind; leave `EconomyPlayerSearch` behavior intact.
4. **CSS cleanup** — Remove unused Economy-only rules (`.economy-*`, formula classes if inlined, `.btn` if unused elsewhere). Leave other page/shell rules on aliases.
5. **Verify** — Manual Economy pass; smoke other routes; `vp check` / `vp test`.

## Verification

- Economy still reads as war-command: warm dark, amber primary, success green, same information hierarchy and density
- Calculator / Jobs / Countries / Shell colors remain intact via aliases
- Combobox overlay still shows Recent / Results groups and selects correctly
- No advisor / search / refresh behavior regressions
- `vp check` and `vp test` pass

## Later phases (same design, separate implementation)

1. Calculator — forms + CountrySelect → Select / Combobox; keep TierPicker custom
2. Jobs — Table + Button actions
3. Countries — forms + Table
4. Dashboard + Shell — layout tokens / Tabs or NavigationMenu
5. Retire legacy aliases and leftover global component CSS

## Non-goals

- Pixel redesign or light mode
- `App*` wrapper layer over every shadcn primitive
- Changing Economy advisor API or game math
- Migrating TierPicker gradients / game icon art into shadcn
- Full deletion of `index.css` in this slice
