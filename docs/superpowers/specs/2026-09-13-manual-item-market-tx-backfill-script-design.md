# Manual Item-Market Transaction Backfill Script — Design

**Date:** 2026-09-13  
**Status:** Approved for implementation  
**Depends on / extends:**

- [Item Market Transactions](./2026-08-04-item-market-transactions-design.md) (append-only ingest)
- Shared walker: `src/jobs/item-market-tx/ingest.ts` (`walkItemMarketTransactions`)
- WarEra client rate limits ([warera-api skill](../../../.agents/skills/warera-api/SKILL.md))

## Goal

Provide a **manual CLI** operators can run to crawl `transaction.getPaginatedTransactions` newest→older into `item_market_transactions` until pages are older than a given `--until` date, without fighting api2 rate limits.

Primary use: fill commodity (`trading`) and/or equipment (`itemMarket`) history beyond what the minute poll’s deepen budget can finish in one sitting.

## Decisions

| Topic | Choice |
| --- | --- |
| Approach | Thin CLI over existing `walkItemMarketTransactions` (deepen-style walk) |
| Timespan | **Until date only** — stop when oldest row on a page is before `--until` |
| Types | `--type trading \| itemMarket \| both` (default `trading`); `both` runs sequentially |
| Rate limits | Shared WarEra client (local RPM + 429 pause) + tunable `--delay-ms` (default **400**, only after inserts) |
| RPM override | Prefer documenting / setting `WARERA_MAX_REQUESTS_PER_MINUTE`; optional `--rpm` only if wiring is cheap |
| Resume | `--cursor` in; print resume cursor on stop / SIGINT |
| Job handoff | Script does **not** flip poll/deepen handoff flags |
| Idempotency | Existing ignore-conflicts insert |

## CLI

```bash
pnpm exec tsx scripts/backfill-item-market-tx.ts --until 2026-08-01
vp run backfill:item-market-tx -- --until 2026-08-01 --type both --delay-ms 300
```

| Flag | Default | Notes |
| --- | --- | --- |
| `--until` | required | ISO date or datetime (UTC if no offset); stop when page oldest `< until` |
| `--type` | `trading` | `trading` \| `itemMarket` \| `both` |
| `--delay-ms` | `400` | Extra pause after pages that insert; `0` allowed |
| `--rpm` | unset | If implemented, overrides soft local cap for this process; else use env |
| `--cursor` | none | Resume API cursor for the current type |
| `--limit` | API / fetch default | Page size when supported |

Exit summary: pages, inserted, stopped reason, resume cursor (if any).

## Behavior

1. Load env (`dotenv` + `parseConfig`), open DB, create Warera client (`background` call class).
2. For each selected type: call `walkItemMarketTransactions` in `deepen` mode with:
   - `lookbackMs` / stop bound equivalent to “page oldest `< until`” (prefer absolute until over “now − lookback” so a long run does not drift);
   - `startCursor` from `--cursor` (first type only, or require re-pass per type when resuming `both`);
   - `pageDelayMs` from `--delay-ms`;
   - no `maxPages` budget (manual run may be long-lived).
3. Skip inter-page delay when `pageInserted === 0` (already in walker).
4. On SIGINT: best-effort log resume cursor and exit non-zero.
5. Progress: debug/info per page (type, pages, inserted, cursor).

### Until-date stop (absolute)

Poll deepen today uses `now - lookbackMs`. For this script, stop when:

`pageOldestMs(items) < until.getTime()`

If the walker only supports lookback-from-now, extend it with an optional `untilMs` (or pass a frozen `now` + `lookbackMs = now - until` at start — acceptable if documented that bound is fixed at process start).

**Recommendation:** add optional `untilMs` to the walker so the bound does not depend on clock drift during multi-hour runs; script passes `untilMs` from `--until`.

## Rate limits

- All HTTP via `src/warera` client (soft local limiter + header/429 governor).
- Default `--delay-ms 400` keeps overnight crawls conservative under the ~500/min upstream policy and default local 120/min.
- Operators may lower delay or raise `WARERA_MAX_REQUESTS_PER_MINUTE` deliberately; 429 still pauses the client.

## Out of scope

- From/to window filtering
- Jobs UI / Croner registration
- Parallel crawls of both types
- Deleting or re-fetching already-stored rows
- Changing automatic poll deepen behavior (separate from this script)

## Inventory note

Update [docs/warera-api/inventory.md](../../warera-api/inventory.md) to mention the manual script as an operator path for deep history (not a scheduled Global job).

## Success criteria

- Operator can run with `--until` and see inserts stop after crossing that date.
- Re-running the same command is safe (conflicts ignored).
- Interrupted run prints a cursor that resumes without re-walking from tip (or documents tip restart if cursor missing).
- No 429 storms under default delay + client governor (verified by logs / remaining headers).
