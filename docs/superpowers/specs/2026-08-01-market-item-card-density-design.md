# Market Item Card Density — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation  
**Related:** Market overview (`MarketPage` / `MarketItemCard`)

## Goal

Make market list cards narrower and denser so more items fit per row, while keeping Buy/Sell as the primary numbers. Reduce empty horizontal space without crowding the card.

Inspired by the icon-tile + identity pattern on [war-era.vercel.app/economy](https://war-era.vercel.app/economy), adapted for this app’s price fields.

## Decisions

| Topic | Choice |
| --- | --- |
| Card layout | **Icon row + quotes** — icon tile beside name/market price; Buy/Sell below in two columns |
| Visual hierarchy | Buy / Sell are primary; market price is a secondary fact under the name |
| Icon treatment | Larger item icon inside a small background tile (separated from the name) |
| Quote labels | **Buy** / **Sell** (drop “Top” from card labels) |
| “Top” meaning | Stays in Market page description only (highest bid / lowest ask) |
| Grid density | Denser than today (~3 cols) — target ~4–5 columns on wide screens; responsive down on smaller breakpoints |
| Scope | UI-only: `MarketItemCard`, Market grid classes, Market intro copy |
| Out of scope | API/data changes; item detail page redesign; adding new card metrics |

## Layout

```
┌─────────────────────────┐
│ [icon]  Name            │
│  tile   🪙 market price │
│                         │
│ BUY          SELL       │
│ 3.262        3.263      │
└─────────────────────────┘
```

- Header row: flex — icon tile + stacked name / market price (muted, with gold icon).
- Quotes row: two equal columns; labels uppercase muted; values mono at full emphasis (green buy / red sell, matching current colors).
- Remove the market-price `Badge` from the top-right so it no longer competes with Buy/Sell.

## Copy

Update Market page blurb to define Buy/Sell without repeating “Top” on every card, e.g.:

> Current market prices by item. Buy is highest bid; Sell is lowest ask.

## Responsive grid

Replace today’s `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with approximately:

`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`

Tune gap slightly tighter if needed so cards stay readable and don’t feel cramped. Prefer slightly more height over width when trading space.

## Non-goals / revisit later

If more per-card fields are added later (spread, volume, change %), revisit density and layout — this design intentionally leaves room to do that without committing to a packed multi-metric card now.

## Files likely touched

- `src/web/features/market/MarketItemCard.tsx`
- `src/web/features/market/MarketPage.tsx`
- `src/web/components/ItemIcon.tsx` and/or local size classes / `index.css` (only if needed for a larger card icon without changing every `ItemIcon` usage)
