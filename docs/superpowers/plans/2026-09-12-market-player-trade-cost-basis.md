# Market Player Trade Cost Basis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/market/$itemCode`, overlay the shell-selected player’s stackable buy/sell chunks on the price chart and show range realized P/L from DB transaction history.

**Architecture:** Ingest commodity (`trading` or confirmed type) fills into existing `item_market_transactions` alongside `itemMarket`. Pure domain modules chunk fills and FIFO-realize P/L. New `GET /api/market/:itemCode/my-trades` reads DB only. Market item page adds chart dots + strip under the chart.

**Tech Stack:** Hono, Drizzle/Turso, Vitest (`vp test`), existing `item-market-tx` jobs, TanStack Charts (`dot` mark), React shell `usePlayerSelection`.

**Design:** [2026-09-12-market-player-trade-cost-basis-design.md](../specs/2026-09-12-market-player-trade-cost-basis-design.md)

## Global Constraints

- **Phase 1 only** — no inventory endpoint, no holdings mid-cost UI (Phase 2 = separate plan after WarEra inventory discovery)
- Stackables / face prices only — no market tax
- Chunk rule: same side + same unit price (6 dp round) + gap ≤ 1h from previous fill
- Chart markers: blue buy / red sell **dots**
- Layout: chart first, personal strip below (no new nav page)
- Player id = shell `player.userId`; require `playerId` query on API
- Ranges: reuse `parsePriceHistoryRange` / `PRICE_HISTORY_RANGES` (`24h` \| `7d` \| `30d`)
- Prefer `vp test path` and `vp check` for verification
- Commit after each task
- Update `docs/warera-api/inventory.md` when commodity tx ingest lands

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/warera/transactions.ts` | Parameterize `transactionType` on fetch (default `itemMarket`) |
| `src/jobs/item-market-tx/ingest.ts` (+ poll/backfill runs) | Ingest both equipment + commodity types into same table |
| `src/db/schema.ts` + drizzle migration | Indexes on `(buyer_id, item_code, created_at)` and `(seller_id, item_code, created_at)` |
| `src/db/item-market-tx-player.ts` | List fills for player + item (buyer or seller) |
| `src/market/chunkFills.ts` | Group fills → chunks |
| `src/market/costBook.ts` | FIFO lots + realized sell P/L + `historyIncomplete` |
| `src/market/buildMyTrades.ts` | Compose chunks (in range) + realized for range |
| `src/server/routes/market.ts` | `GET /:itemCode/my-trades` |
| `src/server/app.ts` | Mount `/api/market` |
| `src/web/features/market/types.ts` | DTOs for my-trades |
| `src/web/features/market/MarketPriceChart.tsx` | Optional buy/sell `dot` marks |
| `src/web/features/market/MarketItemPage.tsx` | Fetch my-trades; strip UI |
| `src/web/features/market/MyTradesStrip.tsx` | Presentational strip |
| `docs/warera-api/inventory.md` | Commodity tx row |

**Deferred (Phase 2 plan):** `GET /api/user/inventory`, holdings strip, live-qty peel in UI.

---

### Task 1: Parameterize transaction fetch by `transactionType`

**Files:**
- Modify: `src/warera/transactions.ts`
- Modify: `src/warera/transactions.test.ts` (create if missing; else extend)
- Modify: callers that hardcode type only if needed after this task

**Interfaces:**
- Consumes: existing `WareraRequester`, `parseItemMarketTransactionsPage`
- Produces:
  - `fetchItemMarketTransactionsPage(warera, opts?: { cursor?: string; limit?: number; transactionType?: string }, init?)`
  - Default `transactionType` remains `"itemMarket"` so equipment jobs stay unchanged until Task 2

- [ ] **Step 1: Write / extend failing test for transactionType in path**

In `src/warera/transactions.test.ts` (create with vitest if absent), assert the request path includes the chosen type:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchItemMarketTransactionsPage } from "./transactions";

describe("fetchItemMarketTransactionsPage", () => {
  it("defaults transactionType to itemMarket", async () => {
    const request = vi.fn(async () => ({ result: { data: { json: { items: [], nextCursor: null } } } }));
    await fetchItemMarketTransactionsPage({ request } as never, { limit: 10 });
    expect(String(request.mock.calls[0]![0])).toContain("itemMarket");
  });

  it("passes custom transactionType", async () => {
    const request = vi.fn(async () => ({ result: { data: { json: { items: [], nextCursor: null } } } }));
    await fetchItemMarketTransactionsPage({ request } as never, {
      limit: 10,
      transactionType: "trading",
    });
    expect(String(request.mock.calls[0]![0])).toContain("trading");
  });
});
```

Adjust unwrap mock shape to match other `src/warera/*.test.ts` fixtures if the above JSON envelope differs.

- [ ] **Step 2: Run test to verify it fails (or custom type ignored)**

Run: `vp test src/warera/transactions.test.ts`

Expected: FAIL until `transactionType` is wired (or second test fails).

- [ ] **Step 3: Implement parameter**

In `fetchItemMarketTransactionsPage`, add `transactionType?: string` to opts; set:

```ts
transactionType: opts.transactionType ?? "itemMarket",
```

Keep `authStyle: "api-key"`.

- [ ] **Step 4: Run tests — pass**

Run: `vp test src/warera/transactions.test.ts`

Expected: PASS

- [ ] **Step 5: Confirm commodity type against live API (manual / script)**

With `WARERA_API_KEY` set, fetch one page of candidate types (try `trading` first, then any OpenAPI enum). Confirm rows have `buyerId`, `sellerId`, `itemCode`, `money`, `quantity`, `createdAt` and parse through `parseItemMarketTransactionsPage`.

Record the working type string as constant for Task 2:

```ts
// src/warera/transactions.ts (or src/jobs/item-market-tx/types.ts)
export const COMMODITY_TRANSACTION_TYPE = "trading"; // replace if API uses another value
```

If **no** commodity type works, stop and update the design/spec before continuing Tasks 2–7 (UI would be empty for stackables).

- [ ] **Step 6: Commit**

```bash
git add src/warera/transactions.ts src/warera/transactions.test.ts
git commit -m "$(cat <<'EOF'
feat(warera): allow transactionType on item-market tx fetch

EOF
)"
```

---

### Task 2: Ingest commodity transactions + player indexes

**Files:**
- Modify: `src/jobs/item-market-tx-poll/run.ts`
- Modify: `src/jobs/item-market-tx-backfill/run.ts`
- Modify: `src/jobs/item-market-tx-poll/run.test.ts` (and backfill tests if present)
- Modify: `src/db/schema.ts` (`itemMarketTransactions` indexes)
- Create: drizzle migration via `vp run db:generate` (or `pnpm db:generate`)
- Modify: job descriptions in `src/jobs/item-market-tx-poll/index.ts` and `...-backfill/index.ts`
- Modify: `docs/warera-api/inventory.md`

**Interfaces:**
- Consumes: `walkItemMarketTransactions`, `fetchItemMarketTransactionsPage`, `COMMODITY_TRANSACTION_TYPE`
- Produces: both `itemMarket` and commodity types stored in `item_market_transactions`; indexes for player lookups

- [ ] **Step 1: Extend poll run to walk both types**

In `runItemMarketTxPoll`, after handoff check, run walk twice (or loop):

```ts
const types = ["itemMarket", COMMODITY_TRANSACTION_TYPE] as const;
const parts: string[] = [];
for (const transactionType of types) {
  const result = await walkItemMarketTransactions({
    db: ctx.db,
    logger: ctx.logger,
    mode: "poll",
    fetchPage: (opts) =>
      fetchItemMarketTransactionsPage(ctx.warera, { ...opts, transactionType }),
  });
  parts.push(
    `${transactionType}: ${result.inserted} inserted, ${result.pages} pages (${result.stoppedReason})`,
  );
}
return `poll: ${parts.join("; ")}`;
```

Mirror the same loop in backfill `runItemMarketTxBackfill` (handoff still set on first successful backfill page inside `walkItemMarketTransactions` — first type that succeeds enables poll; acceptable).

- [ ] **Step 2: Update poll unit test**

Extend `src/jobs/item-market-tx-poll/run.test.ts` so the mocked `fetchPage` / warera is invoked for both types (or assert two walks). Keep handoff-waiting behavior unchanged.

- [ ] **Step 3: Run job tests**

Run: `vp test src/jobs/item-market-tx-poll/run.test.ts src/jobs/item-market-tx/ingest.test.ts`

Expected: PASS

- [ ] **Step 4: Add schema indexes**

In `src/db/schema.ts` on `itemMarketTransactions` table indexes array, add:

```ts
index("item_market_tx_buyer_item_created_at_idx").on(t.buyerId, t.itemCode, t.createdAt),
index("item_market_tx_seller_item_created_at_idx").on(t.sellerId, t.itemCode, t.createdAt),
```

- [ ] **Step 5: Generate migration**

Run: `vp run db:generate` (or `pnpm db:generate`)

Expected: new `drizzle/0013_*.sql` (or next number) with the two `CREATE INDEX` statements.

- [ ] **Step 6: Update inventory.md**

In Global catalog, either extend the Item-market transactions row or add:

| Commodity trading transactions | Stackable buy/sell fills | same `item-market-tx-*` jobs (both transaction types) | … | api2 | `item_market_transactions` | Market my-trades |

Note consumers: Market my-trades.

- [ ] **Step 7: Commit**

```bash
git add src/jobs/item-market-tx-poll src/jobs/item-market-tx-backfill src/db/schema.ts drizzle docs/warera-api/inventory.md src/warera/transactions.ts
git commit -m "$(cat <<'EOF'
feat(jobs): ingest commodity txs and index buyer/seller lookups

EOF
)"
```

---

### Task 3: Chunk fills domain module

**Files:**
- Create: `src/market/chunkFills.ts`
- Create: `src/market/chunkFills.test.ts`

**Interfaces:**
- Consumes: none
- Produces:

```ts
export type FillSide = "buy" | "sell";

export type PlayerFill = {
  id: string;
  side: FillSide;
  money: number;
  quantity: number;
  createdAt: Date;
};

export type TradeChunk = {
  side: FillSide;
  unitPrice: number;
  totalQty: number;
  totalMoney: number;
  startAt: Date;
  endAt: Date;
  fillCount: number;
};

export const CHUNK_GAP_MS = 60 * 60 * 1000;
export const UNIT_PRICE_DECIMALS = 6;

export function unitPrice(money: number, quantity: number): number;
export function roundUnitPrice(price: number): number;
export function chunkFills(fills: PlayerFill[]): TradeChunk[];
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { chunkFills, type PlayerFill } from "./chunkFills";

function fill(partial: Partial<PlayerFill> & Pick<PlayerFill, "id" | "side" | "money" | "quantity" | "createdAt">): PlayerFill {
  return partial;
}

describe("chunkFills", () => {
  it("merges same price buys within 1h gap", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const t1 = new Date("2026-09-01T10:30:00Z");
    const chunks = chunkFills([
      fill({ id: "1", side: "buy", money: 40, quantity: 1000, createdAt: t0 }),
      fill({ id: "2", side: "buy", money: 20, quantity: 500, createdAt: t1 }),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.totalQty).toBe(1500);
    expect(chunks[0]!.totalMoney).toBe(60);
    expect(chunks[0]!.fillCount).toBe(2);
    expect(chunks[0]!.unitPrice).toBeCloseTo(60 / 1500, 10);
  });

  it("splits when gap > 1h", () => {
    const chunks = chunkFills([
      fill({
        id: "1",
        side: "buy",
        money: 10,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      }),
      fill({
        id: "2",
        side: "buy",
        money: 10,
        quantity: 100,
        createdAt: new Date("2026-09-01T12:00:01Z"),
      }),
    ]);
    expect(chunks).toHaveLength(2);
  });

  it("splits different unit prices", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const chunks = chunkFills([
      fill({ id: "1", side: "buy", money: 10, quantity: 100, createdAt: t0 }),
      fill({
        id: "2",
        side: "buy",
        money: 12,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:10:00Z"),
      }),
    ]);
    expect(chunks).toHaveLength(2);
  });

  it("does not merge buy with sell", () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const chunks = chunkFills([
      fill({ id: "1", side: "buy", money: 10, quantity: 100, createdAt: t0 }),
      fill({
        id: "2",
        side: "sell",
        money: 10,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:10:00Z"),
      }),
    ]);
    expect(chunks).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `vp test src/market/chunkFills.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `chunkFills.ts`**

Sort by `createdAt` ascending. Walk fills; append to open chunk when same `side`, `roundUnitPrice(unitPrice(money,qty))` equal, and `createdAt - prev.createdAt <= CHUNK_GAP_MS`. Chunk `unitPrice` for output = `totalMoney / totalQty` (not the rounded key).

- [ ] **Step 4: Run — pass**

Run: `vp test src/market/chunkFills.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/market/chunkFills.ts src/market/chunkFills.test.ts
git commit -m "$(cat <<'EOF'
feat(market): chunk player fills by price and 1h gap

EOF
)"
```

---

### Task 4: FIFO cost book + realized P/L

**Files:**
- Create: `src/market/costBook.ts`
- Create: `src/market/costBook.test.ts`

**Interfaces:**
- Consumes: `PlayerFill` from `chunkFills.ts`
- Produces:

```ts
export type RealizedSale = {
  at: Date;
  qty: number;
  proceeds: number;
  cost: number;
  pnl: number;
};

export type CostBookResult = {
  realized: RealizedSale[];
  historyIncomplete: boolean;
  /** Remaining open buy lots after all fills (for Phase 2) */
  openLots: Array<{ qty: number; unitPrice: number }>;
};

export function runCostBook(fills: PlayerFill[]): CostBookResult;

export function sumRealizedPnl(realized: RealizedSale[], since: Date, until: Date): number;
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { runCostBook, sumRealizedPnl } from "./costBook";
import type { PlayerFill } from "./chunkFills";

describe("runCostBook", () => {
  it("realizes FIFO PnL on sell", () => {
    const fills: PlayerFill[] = [
      {
        id: "b1",
        side: "buy",
        money: 100,
        quantity: 100,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
      {
        id: "s1",
        side: "sell",
        money: 60,
        quantity: 50,
        createdAt: new Date("2026-09-02T10:00:00Z"),
      },
    ];
    const result = runCostBook(fills);
    expect(result.historyIncomplete).toBe(false);
    expect(result.realized).toHaveLength(1);
    expect(result.realized[0]!.cost).toBe(50); // 50 * 1.0
    expect(result.realized[0]!.pnl).toBe(10);
    expect(result.openLots).toEqual([{ qty: 50, unitPrice: 1 }]);
  });

  it("flags incomplete when sell exceeds buys", () => {
    const fills: PlayerFill[] = [
      {
        id: "s1",
        side: "sell",
        money: 10,
        quantity: 10,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ];
    const result = runCostBook(fills);
    expect(result.historyIncomplete).toBe(true);
  });
});

describe("sumRealizedPnl", () => {
  it("sums pnl inside window", () => {
    const total = sumRealizedPnl(
      [
        {
          at: new Date("2026-09-01T12:00:00Z"),
          qty: 1,
          proceeds: 2,
          cost: 1,
          pnl: 1,
        },
        {
          at: new Date("2026-08-01T12:00:00Z"),
          qty: 1,
          proceeds: 2,
          cost: 1,
          pnl: 1,
        },
      ],
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-02T00:00:00Z"),
    );
    expect(total).toBe(1);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `vp test src/market/costBook.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

On buy: push lot. On sell: consume oldest lots; if remaining sell qty after lots empty, set `historyIncomplete` and treat missing cost as `0` for that remainder (or skip adding proceeds-only — prefer: still record sale with `cost` for known lots only and flag incomplete). Spec: best-effort + flag. Implement: consume what exists; any unfilled sell qty → `historyIncomplete = true`; `cost` only for consumed lots; `proceeds` = full sell money; `pnl = proceeds - cost` (optimistic if incomplete — document in code comment).

- [ ] **Step 4: Run — pass**

Run: `vp test src/market/costBook.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/market/costBook.ts src/market/costBook.test.ts
git commit -m "$(cat <<'EOF'
feat(market): FIFO cost book for player fill realized PnL

EOF
)"
```

---

### Task 5: DB read + `buildMyTrades` composer

**Files:**
- Create: `src/db/item-market-tx-player.ts`
- Create: `src/db/item-market-tx-player.test.ts`
- Create: `src/market/buildMyTrades.ts`
- Create: `src/market/buildMyTrades.test.ts`

**Interfaces:**
- Consumes: `chunkFills`, `runCostBook`, `sumRealizedPnl`, `rangeToMs`, `PriceHistoryRange`
- Produces:

```ts
// db
export type PlayerItemFillRow = {
  id: string;
  money: number;
  quantity: number;
  buyerId: string;
  sellerId: string;
  createdAt: Date;
};

export function listPlayerItemFills(
  db: Db,
  opts: { playerId: string; itemCode: string },
): Promise<PlayerItemFillRow[]>;

// market
export type MyTradesResult = {
  itemCode: string;
  playerId: string;
  range: PriceHistoryRange;
  chunks: Array<{
    side: "buy" | "sell";
    unitPrice: number;
    totalQty: number;
    totalMoney: number;
    startAt: Date;
    endAt: Date;
    fillCount: number;
  }>;
  realized: { pnl: number | null; sellQty: number; buyQty: number };
  historyIncomplete: boolean;
  fillCount: number;
};

export function buildMyTrades(opts: {
  itemCode: string;
  playerId: string;
  range: PriceHistoryRange;
  now?: Date;
  rows: PlayerItemFillRow[];
}): MyTradesResult;
```

- [ ] **Step 1: Write DB test (in-memory like other `src/db/*.test.ts`)**

Create minimal `item_market_transactions` table in test setup; insert buy + sell for player; assert `listPlayerItemFills` returns both and maps side via `buyerId === playerId` → buy else sell.

- [ ] **Step 2: Implement `listPlayerItemFills`**

```ts
.where(
  and(
    eq(itemMarketTransactions.itemCode, itemCode),
    or(
      eq(itemMarketTransactions.buyerId, playerId),
      eq(itemMarketTransactions.sellerId, playerId),
    ),
  ),
)
.orderBy(asc(itemMarketTransactions.createdAt));
```

- [ ] **Step 3: Write `buildMyTrades` tests**

Map rows → `PlayerFill[]` (`side` from buyer/seller). Run cost book on **all** fills. Chunk **all** fills then filter chunks overlapping `[now - rangeMs, now]` (chunk overlaps if `endAt >= since && startAt <= now`). `buyQty` / `sellQty` = sum of fill qtys in range by side. `realized.pnl = sumRealizedPnl(...)`. `fillCount = fills.length`.

- [ ] **Step 4: Implement composer**

- [ ] **Step 5: Run tests**

Run: `vp test src/db/item-market-tx-player.test.ts src/market/buildMyTrades.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/item-market-tx-player.ts src/db/item-market-tx-player.test.ts src/market/buildMyTrades.ts src/market/buildMyTrades.test.ts
git commit -m "$(cat <<'EOF'
feat(market): build my-trades summary from player fills

EOF
)"
```

---

### Task 6: `GET /api/market/:itemCode/my-trades`

**Files:**
- Create: `src/server/routes/market.ts`
- Create: `src/server/routes/market.test.ts`
- Modify: `src/server/app.ts` — `app.route("/api/market", marketRoutes({ db }))`

**Interfaces:**
- Consumes: `listPlayerItemFills`, `buildMyTrades`, `parsePriceHistoryRange`, `HttpError`
- Produces: JSON matching design response (ISO dates)

- [ ] **Step 1: Write route tests**

Pattern after `prices.test.ts` / `follow.test.ts`: in-memory db, seed txs, `app.route("/", marketRoutes({ db }))`.

Cases:
1. `400` when `playerId` missing/blank
2. `200` empty chunks when no txs
3. `200` with chunk + realized when seeded buy then sell in range

- [ ] **Step 2: Run — fail**

Run: `vp test src/server/routes/market.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement route**

```ts
app.get("/:itemCode/my-trades", async (c) => {
  const itemCode = c.req.param("itemCode")?.trim() ?? "";
  const playerId = c.req.query("playerId")?.trim() ?? "";
  if (!itemCode) throw new HttpError(400, "bad_request", "itemCode is required");
  if (!playerId) throw new HttpError(400, "bad_request", "playerId is required");
  const range = parsePriceHistoryRange(c.req.query("range"));
  const rows = await listPlayerItemFills(db, { playerId, itemCode });
  const result = buildMyTrades({ itemCode, playerId, range, rows });
  return c.json({
    ...result,
    chunks: result.chunks.map((ch) => ({
      ...ch,
      startAt: ch.startAt.toISOString(),
      endAt: ch.endAt.toISOString(),
    })),
  });
});
```

- [ ] **Step 4: Mount in `createApp`**

- [ ] **Step 5: Run — pass**

Run: `vp test src/server/routes/market.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/market.ts src/server/routes/market.test.ts src/server/app.ts
git commit -m "$(cat <<'EOF'
feat(api): add market my-trades endpoint for player cost basis

EOF
)"
```

---

### Task 7: Market item UI — dots + strip

**Files:**
- Modify: `src/web/features/market/types.ts`
- Create: `src/web/features/market/MyTradesStrip.tsx`
- Modify: `src/web/features/market/MarketPriceChart.tsx`
- Modify: `src/web/features/market/MarketItemPage.tsx`

**Interfaces:**
- Consumes: `usePlayerSelection().player?.userId`, `api()`, chart `dot` from `@tanstack/charts`
- Produces: UI wired to my-trades

- [ ] **Step 1: Add DTO types**

```ts
export type MyTradesChunkDto = {
  side: "buy" | "sell";
  unitPrice: number;
  totalQty: number;
  totalMoney: number;
  startAt: string;
  endAt: string;
  fillCount: number;
};

export type MyTradesResponse = {
  itemCode: string;
  playerId: string;
  range: PriceHistoryRange;
  chunks: MyTradesChunkDto[];
  realized: { pnl: number | null; sellQty: number; buyQty: number };
  historyIncomplete: boolean;
  fillCount: number;
};
```

- [ ] **Step 2: Extend `MarketPriceChart` props**

```ts
export type TradeDot = {
  date: Date;
  price: number;
  side: "buy" | "sell";
  label: string;
};

// props: tradeDots?: TradeDot[]
```

Add marks using `dot` from `@tanstack/charts`:

- Buy series: `fill: "#60a5fa"` (or theme token if one exists)
- Sell series: `fill: "#f87171"`

Split `tradeDots` by side into two `dot(...)` marks. Tooltip should surface `label`.

- [ ] **Step 3: Implement `MyTradesStrip`**

Presentational: props = loading | error | noPlayer | data. Show realized P/L (signed gold via existing helpers), buy/sell chunk counts, incomplete warning, empty copy.

- [ ] **Step 4: Wire `MarketItemPage`**

- `const { player } = usePlayerSelection()`
- When `player` + `itemCode` + `range`, fetch `/api/market/${itemCode}/my-trades?playerId=&range=`
- Map chunks → `tradeDots` (`date` = midpoint of start/end; `price` = unitPrice; `label` = `${side} ${qty} @ ${price}`)
- Pass dots to chart; render strip below chart
- No player: hint only; do not call API

- [ ] **Step 5: Manual smoke**

Run: `vp run dev` — open `/market/ammo` (or a code you trade), select player, confirm dots + strip.

- [ ] **Step 6: `vp check` on touched paths / project**

Run: `vp check`

Expected: clean (fix any format/lint/type issues)

- [ ] **Step 7: Commit**

```bash
git add src/web/features/market
git commit -m "$(cat <<'EOF'
feat(market): show player trade chunks on item price chart

EOF
)"
```

---

## Phase 2 (separate plan — do not implement here)

- Discover stackable inventory WarEra procedure; allowlist + client
- `GET /api/user/inventory?playerId=`
- Peel open lots to live qty; mid cost vs `topSell`; holdings strip UI
- Update inventory.md again

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Commodity tx ingest prerequisite | 1–2 |
| Buyer/seller indexes | 2 |
| Chunk rule (price + 1h gap) | 3 |
| FIFO realized P/L, face prices | 4 |
| my-trades API + range | 5–6 |
| Layout A + dots + strip | 7 |
| No player / empty / incomplete | 6–7 |
| inventory.md on ingest | 2 |
| Phase 2 inventory / holdings | Deferred section |

No equipment/tax in this plan. No new Inventory page.
