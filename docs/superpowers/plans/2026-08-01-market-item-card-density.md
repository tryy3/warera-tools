# Market Item Card Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Market overview item cards narrower and denser (icon tile + name/market price, primary Buy/Sell) so more items fit per row.

**Architecture:** Pure WebUI change. Redesign `MarketItemCard` markup/classes; widen the Market section grid; update intro copy. Size the card icon via a local `className` on `ItemIcon` inside a tile wrapper so other `ItemIcon` call sites stay unchanged. No API or data model changes.

**Tech Stack:** React 19, TanStack Router `Link`, Tailwind utility classes, existing `GoldIcon` / `ItemIcon` / `formatDisplayNumber`.

**Design:** [2026-08-01-market-item-card-density-design.md](../specs/2026-08-01-market-item-card-density-design.md)

## Global Constraints

- Layout: **Icon row + quotes** (icon tile beside name/market price; Buy/Sell below)
- Hierarchy: Buy / Sell primary; market price secondary under the name
- Labels on cards: **Buy** / **Sell** only (no “Top”)
- “Top” meaning only in Market page description (highest bid / lowest ask)
- Grid target: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
- Remove market-price `Badge` from the card
- Do not change every `ItemIcon` default size — override only on this card
- UI polish: no new unit tests required; verify with `vp check` + manual Market page pass
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/features/market/MarketItemCard.tsx` | Card layout: icon tile, name, market price, Buy/Sell |
| `src/web/features/market/MarketPage.tsx` | Section grid density + intro copy |

---

### Task 1: Redesign `MarketItemCard`

**Files:**
- Modify: `src/web/features/market/MarketItemCard.tsx`

**Interfaces:**
- Consumes: `LatestPriceItem`, `formatItem`, `formatDisplayNumber`, `GoldIcon`, `ItemIcon`, TanStack `Link`
- Produces: same `export function MarketItemCard({ item }: { item: LatestPriceItem })` — markup/classes only

- [ ] **Step 1: Replace card markup**

Rewrite `MarketItemCard.tsx` to the following (drop unused `Badge` import):

```tsx
import { Link } from "@tanstack/react-router";
import { formatDisplayNumber } from "@/lib/formatDisplayNumber";
import { GoldIcon } from "../../components/GoldIcon";
import { ItemIcon } from "../../components/ItemIcon";
import { formatItem } from "./formatItem";
import type { LatestPriceItem } from "./types";

function formatNum(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value, digits);
}

function MarketPriceLine({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <GoldIcon />
      {formatDisplayNumber(value)}
    </span>
  );
}

type Props = {
  item: LatestPriceItem;
};

export function MarketItemCard({ item }: Props) {
  return (
    <Link
      to="/market/$itemCode"
      params={{ itemCode: item.itemCode }}
      search={{ range: "7d" }}
      className="block rounded-md border border-border bg-secondary px-3 py-2.5 text-inherit no-underline shadow-none transition-colors hover:border-primary/45 hover:bg-secondary/80"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-background/60">
          <ItemIcon itemCode={item.itemCode} className="size-7 object-contain" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold leading-tight">{formatItem(item.itemCode)}</div>
          <div className="mt-0.5 text-[0.8rem] leading-tight">
            <MarketPriceLine value={item.marketPrice} />
          </div>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">Buy</dt>
          <dd className="mt-0.5 mb-0 font-mono text-success">{formatNum(item.buyMax)}</dd>
        </div>
        <div>
          <dt className="m-0 text-[0.75em] tracking-wide text-muted-foreground uppercase">Sell</dt>
          <dd className="mt-0.5 mb-0 font-mono text-destructive">{formatNum(item.sellMin)}</dd>
        </div>
      </dl>
    </Link>
  );
}
```

Notes:
- Keep mapping **Buy → `buyMax`**, **Sell → `sellMin`** (same as current top bid/ask).
- Icon tile uses `bg-background/60` so the icon reads as separated from the name without a heavy card-in-card look.
- If the gold glyph looks oversized next to the muted price, pass a small class to `GoldIcon` only if that component already accepts `className`; otherwise leave default.

- [ ] **Step 2: Typecheck / lint the card file**

Run: `vp check`
Expected: PASS (or only pre-existing unrelated failures)

- [ ] **Step 3: Commit**

```bash
git add src/web/features/market/MarketItemCard.tsx
git commit -m "$(cat <<'EOF'
feat(web): densify market item cards with icon tile layout

EOF
)"
```

---

### Task 2: Denser Market grid + intro copy

**Files:**
- Modify: `src/web/features/market/MarketPage.tsx`

**Interfaces:**
- Consumes: `MarketItemCard` from Task 1
- Produces: denser section grid + Buy/Sell definition in page blurb

- [ ] **Step 1: Update intro copy**

In `MarketPage.tsx`, replace the blurb sentence:

```tsx
Current market prices by item. Top buy is highest bid; top sell is lowest ask.
```

with:

```tsx
Current market prices by item. Buy is highest bid; Sell is lowest ask.
```

Keep the optional ` · as of …` suffix unchanged.

- [ ] **Step 2: Widen the section grid**

Replace the section grid class:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
```

with:

```tsx
<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
```

- [ ] **Step 3: Verify**

Run: `vp check`
Expected: PASS

Manual (with `vp run dev` / existing app): open `/market`
- Cards show icon tile, name, muted market price under name
- Labels read **Buy** / **Sell** (not Top buy/sell)
- Wide viewport shows ~4–5 cards per row
- Page description defines Buy/Sell as highest bid / lowest ask
- Card still links to `/market/$itemCode?range=7d`

- [ ] **Step 4: Commit**

```bash
git add src/web/features/market/MarketPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): pack market overview grid and clarify Buy/Sell copy

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Icon row + quotes layout | Task 1 |
| Larger icon in background tile | Task 1 |
| Name + market price under name (secondary) | Task 1 |
| Buy/Sell primary, full weight | Task 1 |
| Drop “Top” from card labels | Task 1 |
| Remove market-price Badge | Task 1 |
| Page description defines Buy/Sell | Task 2 |
| Denser grid ~4–5 cols | Task 2 |
| No API changes / ItemIcon global default untouched | Task 1 (local `className` only) |
