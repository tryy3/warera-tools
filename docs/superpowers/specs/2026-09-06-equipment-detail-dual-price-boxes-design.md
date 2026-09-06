# Equipment Detail Dual Price Boxes — Design

**Date:** 2026-09-06  
**Status:** Approved for implementation  
**Extends:** [Equipment Market Pricing UI](./2026-08-05-equipment-market-pricing-design.md)

## Goal

On the equipment **detail** page, reduce visual clutter from separate incl/excl cells by stacking tax-incl and tax-excl in the same price box, and align displayed gold amounts with in-game precision (max 3 decimal places).

## Decisions

| Topic | Choice |
| --- | --- |
| Scope | Detail page only (`EquipmentDetailPage`) — not overview cards, not charts |
| Layout | Stacked dual-value boxes: incl primary, excl muted below |
| Market | One **Market** box (incl + excl); remove separate Seller excl box |
| Seller excl toggle | Remove entirely; excl always shown when the dual box is rendered |
| Recommend | **Break-even** and **Attractive (+5%)** each dual-stacked; drop duplicate **Market** box; keep **Vs market** |
| No tax (country unset) | Still show excl row as `—` (not hide the row) |
| Scrap | Single-value box (no tax pair) |
| Decimals | Max **3** fraction digits for gold amounts in Price triad + Recommend (trim trailing zeros) |
| API / DTOs | Unchanged — derive recommend excl client-side when tax known |

## Layout

### Price triad

| Box | Content |
| --- | --- |
| Market | Line 1: market median (incl). Line 2: seller net (excl), or `—` if `taxRate` / `sellerNet` null |
| Scrap price | Scrap floor only (unchanged) |

No “Show / Hide seller excl” control. Keep the existing amber guidance when tax is missing.

### Recommend

| Box | Content |
| --- | --- |
| Break-even | Incl from `recommend.breakEvenIncl`; excl = `incl / (1 + taxRate)` or `—` |
| Attractive (+5%) | Incl from `recommend.attractiveIncl`; excl same derivation |
| Vs market | Existing incl-based comparison copy (unchanged) |

When recommend is unavailable (missing tax, scrap, or tier), keep current unavailable messaging — do not invent dual boxes.

## Components & data

- Introduce a small detail-page (or feature-local) dual amount box helper (e.g. `GoldInclExcl` / `PriceBox`) so Market / Break-even / Attractive share one pattern.
- Single-value boxes (scrap, vs market) stay on the simpler pattern.
- Formatting: `formatDisplayNumber(value, 3)` for these gold displays and for numeric deltas inside “Vs market” on this page.
- Market excl uses existing `sellerNet` from the API.
- Recommend excl is computed only when `taxRate` is known; never invent excl without tax.
- No server route, DTO, or formula changes required.

## Out of scope

- Overview `EquipmentItemCard` Market / Net cells
- Chart axes, tooltips, or ladder/trend series formatting
- Changing the global default of `formatDisplayNumber` (remains 4 elsewhere)
- Calculator page layout

## Testing

- Prefer a focused unit test on the dual-box helper / excl derivation (null tax → `—`; 3-decimal display) if extracted.
- No new API tests unless excl fields are later promoted into the DTO.

## Success criteria

1. Detail Price triad shows Market (incl+excl) and Scrap — not three tax-related cells.
2. Recommend shows Break-even, Attractive, Vs market — no duplicate Market box.
3. Seller excl toggle is gone.
4. With no country/tax, excl lines show `—`.
5. Displayed gold amounts in these sections never show more than 3 decimal places.
