# Economy Company Card Polish — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md)

## Goal

Tighten `CompanyCard` layout so the default view stays dense and scannable, while formula transparency remains one click away in purpose-specific drawers.

## Decisions

| Topic | Choice |
| --- | --- |
| Formula disclosure | Native `<details>` / `<summary>`, closed by default |
| Drawer count | Two independent sections per card (current math vs switch math) |
| Global expand | None — no per-card “expand all”, no page-level expand |
| Stats column spacing | Slightly increase horizontal gap (~2px / ~0.15rem) |
| Switch summary alignment | Flex / inline-flex so icons and text share one baseline |
| Transfer gold | Gold estimate on its own line under Concrete count |

## Card structure

Unchanged top-level order:

1. Header (name + daily value pill)
2. Main `.economy-stats` grid
3. **How calculated** `<details>` — current-company formulas only
4. Best switch block (or muted empty state)

Inside the best switch block:

1. Title + summary line (`→ item @ region (+bonus)`)
2. Compact stats (Δ / day, Transfer, Payback)
3. **Switch math** `<details>` — switch formulas only

### Current formulas drawer

- Summary label: **How calculated**
- Contents (when present): Production bonus, Profit / PP, AE / day `FormulaBox`es
- Independent open state from the switch drawer

### Switch formulas drawer

- Summary label: **Switch math**
- Contents (when present): Alt Profit / PP, Alt AE / day, Transfer cost, Payback `FormulaBox`es
- Only rendered when `row.bestSwitch` exists
- Independent open state from the current-formulas drawer

### Styling

Reuse the existing formula visual language (dashed border, muted dark fill, accent label). The `<details>` shell should read as optional detail, not a second card. Keep `FormulaBox` internals as they are.

## Layout polish

### Main stats gap

Increase `.economy-stats` column `gap` slightly (about `0.75rem` → `0.9rem`) so the six columns breathe without changing the grid template.

### Best-switch summary line

Replace the current loose `<p>` stacking with a single horizontal flex/inline-flex row so item icons, region flags, and text align on one baseline.

### Transfer cell

Render Transfer as two lines:

```
{n} Concrete
~ {gold}   (GoldIcon + value)
```

Avoid squeezing gold onto the same line as Concrete when the compact column is narrow.

## Out of scope

- Changing formula text or advisor math
- Persisting open/closed state across navigations
- Animated height transitions beyond browser default for `<details>`
- Expanding formulas outside `CompanyCard` (e.g. opportunities board)

## Files likely touched

- `src/web/features/economy/EconomyPage.tsx` — wrap formula groups; Transfer markup; switch summary markup
- `src/web/index.css` — stats gap; details/summary styles; switch line alignment; transfer stacking
