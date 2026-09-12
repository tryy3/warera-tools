# Market Player Trade Cost Basis — Design

**Date:** 2026-09-12  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Market Price Charts](./2026-08-01-market-price-charts-design.md) (`/market/$itemCode`, ranges, TanStack Charts)
- [Item Market Transactions Poll](./2026-08-04-item-market-transactions-design.md) (append-only tx ingest pattern)
- [Data Tier Caching Strategy](./2026-08-02-data-tier-caching-strategy-design.md) (Global history + User demand reads)
- WarEra: `transaction.getPaginatedTransactions` ([warera-api skill](../../../.agents/skills/warera-api/SKILL.md))

## Goal

On Market item pages, show the shell-selected player’s **buy/sell activity** for stackable commodities: chunked fills overlaid on the existing price chart, **realized P/L** for the selected history range, and (later) **holdings mid-cost vs current Sell ask** using live inventory + FIFO cost lots.

Primary question: “What did I pay / sell, and would selling what I still hold be profitable?”

## Decisions

| Topic | Choice |
| --- | --- |
| Scope (v1 items) | **Stackable commodities** only (ammo, food, raw/manufactured goods). Equipment + market tax excl. later |
| Placement | Extend **Market item** page (`/market/$itemCode`) — layout: chart first, personal strip below |
| Chart markers | **Dots** at chunk mid-time / unit price (blue buy, red sell); tooltip with qty, price, fill count, span |
| Chunk rule | Same item + same side + same unit price (rounded) + **≤ 1h gap from previous fill** in the chunk |
| Cost / P/L prices | **Face prices** (`money / quantity`). No market tax for stackables |
| Holdings cost | Phase 2: FIFO lots vs **live inventory**; peel oldest lots when live qty &lt; open lots; remainder above lots = **untracked**; **mid cost** = weighted average of tracked remainder vs latest **Sell ask** (`topSell`) |
| Realized P/L | FIFO against buy lots on market sells; windowed to chart range (24h / 7d / 30d) |
| Player identity | Shell-selected player id; already present on txs as `buyerId` / `sellerId` when fills exist |
| API split | (1) player trades for item — DB read; (2) inventory — WarEra, Phase 2 |
| Inventory source | **Not available today** on allowlist (only `inventory.fetchCurrentEquipment`). Phase 1 ships without holdings; Phase 2 after procedure discovery |
| Phasing | **P1:** commodity tx ingest (if needed) + my-trades API + chart dots + range realized P/L. **P2:** inventory endpoint + holdings strip |
| Approach | Phased Market overlay (not a new Inventory page; not block-on-inventory) |

## Prerequisite: commodity transaction history

Today’s `item-market-tx-*` jobs ingest `transactionType: "itemMarket"` (equipment-oriented). Stackable commodity fills likely use a **different** `transactionType` (e.g. `trading` — confirm against OpenAPI / live API).

**Before P1 UI is useful for stackables**, verify and implement one of:

1. Extend ingest to also page the commodity transaction type into the same (or sibling) table with `buyerId`, `sellerId`, `itemCode`, `money`, `quantity`, `createdAt`, or  
2. Confirm commodity fills already appear under `itemMarket` (unlikely given prior design).

Until commodity fills are in DB for the selected player, the strip shows empty / incomplete — do not pretend equipment-only history answers commodity cost basis.

Update [docs/warera-api/inventory.md](../../warera-api/inventory.md) when commodity tx ingest or inventory fetch is added.

## Architecture

```
[Global] commodity (+ existing itemMarket) tx poll/backfill
  → item_market_transactions (or shared commodity table)
  → buyer_id / seller_id indexed with item_code + created_at

[Market detail /market/$itemCode]
  → existing GET /api/prices/history?itemCode=&range=
  → GET /api/market/:itemCode/my-trades?playerId=&range=
       → filter txs by player as buyer or seller
       → chunk grouper
       → realized P/L (FIFO) for range
  → UI: dots on chart + strip under chart

[Phase 2]
  → GET /api/user/inventory?playerId=  (WarEra TBD, User tier / Load-Refresh TTL)
  → cost book: FIFO lots + live qty → mid cost, untracked, unrealized vs topSell
```

**Tiers:** Tx history remains Global (jobs own refresh). My-trades is a demand-driven read over Global data. Inventory is User tier (no per-user cron).

## Domain logic

### Unit price

`unitPrice = money / quantity`, rounded to a fixed precision (e.g. 6 decimal places) for chunk equality only. Store/display using precise values from totals where possible (`totalMoney / totalQty` for chunk mid).

### Chunking

Process buys and sells separately, chronological order:

- Start a chunk on first fill.
- Append next fill if same side, same rounded unit price, and `createdAt - previousFill.createdAt ≤ 1h`.
- Else close chunk and start new.

Chunk fields: `side`, `unitPrice`, `totalQty`, `totalMoney`, `startAt`, `endAt`, `fillCount`.

Chart dot: time = midpoint of `[startAt, endAt]`; price = chunk `totalMoney / totalQty`.

### Cost book / FIFO

1. Walk all player fills for the item in time order (not only the UI range) when computing lots for realized P/L accuracy within range — or walk from before range with open lots carried in; prefer full history available in DB for that player+item.
2. **Buy** → push lot `{ qty, unitPrice }`.
3. **Sell** → consume lots FIFO; realized = sell proceeds − cost of consumed lots. Attribute realized events to the sell time for range filters.
4. **Phase 2:** After applying fills, if live inventory `H` &lt; sum(lot qty), discard oldest lot quantity until sum = `H` (consumption/craft/etc.). If `H` &gt; sum(lot qty), `untrackedQty = H - sum`.
5. **Mid cost** = `Σ(qty × unitPrice) / Σ(qty)` over remaining tracked lots. Unrealized ≈ `(topSell - midCost) * trackedQty` (face; no tax).

### Incomplete history

If sells exhaust lots (negative / short lots) or Phase 2 live qty implies missing buys, set `historyIncomplete: true` and show a soft UI warning. Still return best-effort numbers.

## APIs

### `GET /api/market/:itemCode/my-trades?playerId=&range=`

| Query | Required | Notes |
| --- | --- | --- |
| `playerId` | yes | Shell player id |
| `range` | no | `24h` \| `7d` \| `30d`; default `7d` (same as price history) |

**Response (illustrative):**

```ts
{
  itemCode: string;
  playerId: string;
  range: "24h" | "7d" | "30d";
  chunks: Array<{
    side: "buy" | "sell";
    unitPrice: number;
    totalQty: number;
    totalMoney: number;
    startAt: string; // ISO
    endAt: string;
    fillCount: number;
  }>;
  realized: {
    pnl: number | null; // null if cannot compute
    sellQty: number;
    buyQty: number; // buys in range (informational)
  };
  historyIncomplete: boolean;
  fillCount: number; // fills considered for this item+player in lookback used
}
```

- DB-only; no live WarEra call.
- Chunks returned should cover the selected range (for chart overlay); FIFO for realized may use older buys outside the range from DB.

### Phase 2: `GET /api/user/inventory?playerId=`

- Discover WarEra procedure; add to allowlist / client.
- User-tier TTL aligned with shell Load/Refresh (~10m).
- Return stackable qty by `itemCode` (shape TBD from upstream).

### Schema

Add indexes (names indicative):

- `(buyer_id, item_code, created_at)`
- `(seller_id, item_code, created_at)`

Reuse existing `item_market_transactions` if commodity rows share the same shape; otherwise a parallel append-only table with the same player/item/money/qty/time fields. Prefer one table if types coexist cleanly via `transaction_type`.

## UI

### Market item page (`MarketItemPage`)

1. Existing header stats + range buttons + `MarketPriceChart`.
2. When `playerId` selected: fetch my-trades; pass chunk points into chart as buy/sell dots (TanStack Charts scatter/point layer or overlay — implementation detail).
3. Strip below chart:
   - Realized P/L for current range (signed gold).
   - Buy/sell chunk counts.
   - Incomplete-history warning when flagged.
4. No player: one-line hint to select a player in the shell.
5. No trades: “No trades in this range.”
6. Phase 2: holdings block — live qty, mid cost, untracked qty, unrealized vs Sell ask.

Market overview list unchanged (no per-card P/L in v1).

## Errors & empty states

| Case | Behavior |
| --- | --- |
| Missing `playerId` | 400 on API; UI hint |
| No fills | 200 empty chunks; UI empty copy |
| DB / query failure | 500; UI error + Retry |
| Inventory unavailable (P2) | Omit holdings or explicit unavailable; trades still work |
| Commodity ingest not ready | Documented; UI empty until data exists |

## Testing

- Unit: chunk grouper (gap, price mismatch, side split, multi-fill session &gt; 1h wall but ≤1h gaps).
- Unit: FIFO / mid cost / untracked / short lots → `historyIncomplete`.
- Unit: realized P/L filtered by range with buys before range.
- API: buyer and seller filters; range parsing; validation.
- Optional UI: dots only when player + chunks present.

## Out of scope

- Equipment / gear cost basis and market-tax excl. netting (future; tax applies there).
- New Inventory / Holdings nav page.
- Per-user cron for trades or inventory.
- Manual quantity entry (rejected in favor of live inventory later).
- Guaranteeing full lifetime history beyond what Global poll retention already stores.

## Implementation order

1. Confirm commodity `transactionType` + ingest (or confirm existing coverage).
2. Player+item indexes + my-trades read path + chunk + FIFO modules.
3. `GET /api/market/:itemCode/my-trades`.
4. Market item UI: dots + strip.
5. Phase 2: inventory procedure + holdings strip + inventory.md update.

## Open follow-ups (non-blocking for P1 UI after ingest)

- Exact WarEra inventory procedure name and payload for stackables.
- Whether commodity and equipment txs share one table long-term.
- Equipment cost-basis mode (per-item id + tax excl.) as a separate spec.
