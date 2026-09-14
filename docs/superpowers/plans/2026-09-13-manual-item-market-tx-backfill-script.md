# Manual Item-Market TX Backfill Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual CLI that crawls `transaction.getPaginatedTransactions` into Turso until pages are older than `--until`, reusing the shared walker and WarEra rate limiter.

**Architecture:** Extend `walkItemMarketTransactions` with absolute `untilMs` + `AbortSignal` for resume-friendly stops. Thin script boots config/DB/client, parses flags, runs deepen-mode walks per type, prints resume cursor. Package script wires `tsx`.

**Tech Stack:** TypeScript, `tsx`, existing Drizzle/Turso + `createWareraClient`, Vitest via `vp test --dir src`.

## Global Constraints

- All WarEra HTTP must go through `src/warera` (local RPM + 429 governor).
- Default `--delay-ms` is **400**; delay only after pages that insert (already in walker).
- Script must **not** flip poll/deepen handoff flags (`enableItemMarketTxPoll` / `markCommodityDeepenDone`).
- `--type` default is **`trading`**; allowed values: `trading` | `itemMarket` | `both`.
- `--until` is required (ISO date/datetime).
- Idempotent inserts via existing ignore-conflicts path.
- Update `docs/warera-api/inventory.md` in the same work as the script.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/jobs/item-market-tx/ingest.ts` | Walker: optional `untilMs`, `signal`; stop reasons `until` / `aborted` |
| `src/jobs/item-market-tx/ingest.test.ts` | Tests for until + abort |
| `scripts/backfill-item-market-tx.ts` | CLI: argv, boot, walk loop, SIGINT, summary |
| `package.json` | `backfill:item-market-tx` script |
| `docs/warera-api/inventory.md` | Mention manual operator path |

---

### Task 1: Walker `untilMs` + abort

**Files:**
- Modify: `src/jobs/item-market-tx/ingest.ts`
- Test: `src/jobs/item-market-tx/ingest.test.ts`

**Interfaces:**
- Consumes: existing `walkItemMarketTransactions` options
- Produces: options `untilMs?: number`, `signal?: AbortSignal`; stop reasons `"until"` | `"aborted"`; `resumeCursor` set on `aborted` (and unchanged for `until` → `null`)

- [ ] **Step 1: Write the failing tests**

Add to `ingest.test.ts` inside `describe("walkItemMarketTransactions")`:

```ts
  it("deepen stops on untilMs with reason until", async () => {
    const until = new Date("2026-08-01T00:00:00.000Z");
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          makeTx({ id: "a", createdAt: new Date("2026-08-10T12:00:00.000Z") }),
        ],
        nextCursor: "c2",
      } satisfies ItemMarketTransactionsPage)
      .mockResolvedValueOnce({
        items: [
          makeTx({ id: "b", createdAt: new Date("2026-07-15T12:00:00.000Z") }),
        ],
        nextCursor: "c3",
      } satisfies ItemMarketTransactionsPage);

    const result = await walkItemMarketTransactions({
      db,
      logger: silentLogger,
      mode: "deepen",
      fetchPage,
      pageDelayMs: 0,
      untilMs: until.getTime(),
    });

    expect(result.stoppedReason).toBe("until");
    expect(result.pages).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.resumeCursor).toBeNull();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("aborts between pages and returns resumeCursor", async () => {
    const ac = new AbortController();
    const fetchPage = vi.fn(async (): Promise<ItemMarketTransactionsPage> => {
      if (fetchPage.mock.calls.length === 1) {
        return {
          items: [makeTx({ id: "p1", createdAt: new Date("2026-08-10T12:00:00.000Z") })],
          nextCursor: "resume-here",
        };
      }
      ac.abort();
      return {
        items: [makeTx({ id: "p2", createdAt: new Date("2026-08-09T12:00:00.000Z") })],
        nextCursor: "later",
      };
    });

    const result = await walkItemMarketTransactions({
      db,
      logger: silentLogger,
      mode: "deepen",
      fetchPage,
      pageDelayMs: 0,
      untilMs: new Date("2026-01-01T00:00:00.000Z").getTime(),
      signal: ac.signal,
      maxPages: 10,
    });

    expect(result.stoppedReason).toBe("aborted");
    expect(result.resumeCursor).toBe("resume-here");
    expect(result.pages).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH="$PWD/node_modules/.bin:$PATH" vp test --dir src/jobs/item-market-tx`

Expected: FAIL — `untilMs` / `aborted` not implemented (or wrong stop reason `lookback`).

- [ ] **Step 3: Implement walker changes**

In `src/jobs/item-market-tx/ingest.ts`, extend options and loop:

```ts
  lookbackMs?: number;
  /** Absolute stop: page oldest < untilMs (preferred over lookback for long runs). */
  untilMs?: number;
  now?: Date;
  // ...
  signal?: AbortSignal;
```

Destructure `untilMs` and `signal`.

At the **start** of each loop iteration (before page_budget check is fine, but after page_budget early return is OK too — prefer **first** line inside `for (;;)`):

```ts
    if (signal?.aborted) {
      return {
        pages,
        inserted,
        stoppedReason: "aborted",
        resumeCursor: cursor ?? null,
      };
    }
```

Replace lookback stop block with:

```ts
    if (useLookback && page.items.length > 0) {
      const boundMs = untilMs ?? now.getTime() - lookbackMs;
      if (pageOldestMs(page.items) < boundMs) {
        return {
          pages,
          inserted,
          stoppedReason: untilMs != null ? "until" : "lookback",
          resumeCursor: null,
        };
      }
    }
```

Also check `signal?.aborted` **after** updating `cursor = page.nextCursor` and **before** sleep, returning `resumeCursor: cursor` so SIGINT after a successful page can resume at nextCursor.

For the abort test above: abort during second fetch — after first page sets cursor to `resume-here`, second iteration starts; if abort happens mid-fetch, check after fetch returns too:

```ts
    const page = await fetchPage({ cursor, limit });
    if (signal?.aborted) {
      return {
        pages,
        inserted,
        stoppedReason: "aborted",
        resumeCursor: cursor ?? null,
      };
    }
    pages += 1;
```

(Adjust test expectations if abort timing differs — resume cursor must be the cursor **used for the next unfetched page**, i.e. last `nextCursor` assigned.)

Do **not** change backfill handoff behavior.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH="$PWD/node_modules/.bin:$PATH" vp test --dir src/jobs/item-market-tx`

Expected: all ingest tests PASS (including existing deepen/lookback/page_budget).

- [ ] **Step 5: Commit**

```bash
git add src/jobs/item-market-tx/ingest.ts src/jobs/item-market-tx/ingest.test.ts
git commit -m "$(cat <<'EOF'
feat(item-market-tx): support untilMs and abort in tx walker

EOF
)"
```

---

### Task 2: CLI script + package.json + inventory note

**Files:**
- Create: `scripts/backfill-item-market-tx.ts`
- Modify: `package.json` (add script)
- Modify: `docs/warera-api/inventory.md` (manual path note on item-market / commodity rows)

**Interfaces:**
- Consumes: `walkItemMarketTransactions` with `mode: "deepen"`, `untilMs`, `pageDelayMs`, `startCursor`, `signal`
- Consumes: `fetchItemMarketTransactionsPage`, `COMMODITY_TRANSACTION_TYPE`
- Consumes: `loadConfig` / `parseConfig`, `createDb`, `createWareraClient`, `createServerLogger` (or equivalent logger factory used by server)
- Produces: runnable `vp run backfill:item-market-tx -- --until …`

- [ ] **Step 1: Add package.json script**

In `package.json` `"scripts"`:

```json
"backfill:item-market-tx": "tsx scripts/backfill-item-market-tx.ts"
```

- [ ] **Step 2: Implement CLI**

Create `scripts/backfill-item-market-tx.ts`:

```ts
import "dotenv/config";
import { loadConfig } from "../src/config/env";
import { createDb } from "../src/db/client";
import { createServerLogger } from "../src/logging/createServerLogger";
import { walkItemMarketTransactions } from "../src/jobs/item-market-tx/ingest";
import {
  COMMODITY_TRANSACTION_TYPE,
  fetchItemMarketTransactionsPage,
} from "../src/warera/transactions";
import { createWareraClient } from "../src/warera";

type TxType = "trading" | "itemMarket";

function usage(): never {
  console.error(`Usage: tsx scripts/backfill-item-market-tx.ts --until <ISO> [options]

Options:
  --until <ISO>     Stop when page oldest is before this instant (required)
  --type <name>     trading | itemMarket | both (default: trading)
  --delay-ms <n>    Pause after inserting pages (default: 400)
  --rpm <n>         Override WARERA_MAX_REQUESTS_PER_MINUTE for this process
  --cursor <str>    Resume cursor (applies to the first type only)
  --limit <n>       Page size
`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  let until: Date | undefined;
  let type: "trading" | "itemMarket" | "both" = "trading";
  let delayMs = 400;
  let rpm: number | undefined;
  let cursor: string | undefined;
  let limit: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v == null) usage();
      return v;
    };
    if (a === "--until") until = new Date(next());
    else if (a === "--type") {
      const v = next();
      if (v !== "trading" && v !== "itemMarket" && v !== "both") usage();
      type = v;
    } else if (a === "--delay-ms") delayMs = Number(next());
    else if (a === "--rpm") rpm = Number(next());
    else if (a === "--cursor") cursor = next();
    else if (a === "--limit") limit = Number(next());
    else if (a === "--help" || a === "-h") usage();
    else usage();
  }

  if (!until || Number.isNaN(until.getTime())) usage();
  if (!Number.isFinite(delayMs) || delayMs < 0) usage();
  if (rpm != null && (!Number.isFinite(rpm) || rpm <= 0)) usage();
  if (limit != null && (!Number.isFinite(limit) || limit <= 0)) usage();

  return { until, type, delayMs, rpm, cursor, limit };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  if (args.rpm != null) {
    (config as { wareraMaxRequestsPerMinute: number }).wareraMaxRequestsPerMinute =
      args.rpm;
  }

  const logger = createServerLogger(config); // use the project's real factory signature
  const { db, client } = createDb(config, logger);
  const warera = createWareraClient({ config, logger });

  const types: TxType[] =
    args.type === "both" ? ["trading", "itemMarket"] : [args.type];

  const ac = new AbortController();
  const onSig = () => {
    console.error("SIGINT — finishing current page then stopping…");
    ac.abort();
  };
  process.on("SIGINT", onSig);

  const untilMs = args.until.getTime();
  let startCursor = args.cursor;
  const summaries: string[] = [];

  try {
    for (const transactionType of types) {
      const apiType =
        transactionType === "trading" ? COMMODITY_TRANSACTION_TYPE : "itemMarket";

      const result = await walkItemMarketTransactions({
        db,
        logger: logger.child({ name: `backfill:${transactionType}` }),
        mode: "deepen",
        pageDelayMs: args.delayMs,
        untilMs,
        startCursor,
        limit: args.limit,
        signal: ac.signal,
        fetchPage: (opts) =>
          fetchItemMarketTransactionsPage(warera, {
            ...opts,
            transactionType: apiType,
          }),
      });

      summaries.push(
        `${transactionType}: inserted=${result.inserted} pages=${result.pages} reason=${result.stoppedReason} resumeCursor=${result.resumeCursor ?? ""}`,
      );
      console.log(summaries.at(-1));

      if (result.stoppedReason === "aborted") {
        console.error(
          `Resume with: --type ${transactionType} --cursor ${JSON.stringify(result.resumeCursor)} --until ${args.until.toISOString()}`,
        );
        process.exitCode = 130;
        break;
      }

      // Cursor only applies to the first type; clear for subsequent types.
      startCursor = undefined;
    }
  } finally {
    process.off("SIGINT", onSig);
    client.close();
  }

  console.log(summaries.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

**Fix before shipping:** match `createServerLogger` export/signature from `src/logging/createServerLogger.ts` (read file; if it needs different args, use the same pattern as `src/server/index.ts`). Prefer `loadConfig()` after `dotenv/config` like `migrate-cli.ts`.

**Config override:** if `AppConfig` is readonly, spread:

```ts
const base = loadConfig();
const config = args.rpm != null
  ? { ...base, wareraMaxRequestsPerMinute: args.rpm }
  : base;
```

Do **not** call `enableItemMarketTxPoll` or deepen handoff markers.

- [ ] **Step 3: Update inventory.md**

On the Item-market / Commodity trading rows in `docs/warera-api/inventory.md`, add a short note that operators can run `vp run backfill:item-market-tx -- --until <ISO> [--type …]` for manual deep history (not a scheduled job).

- [ ] **Step 4: Smoke-check CLI help**

Run: `PATH="$PWD/node_modules/.bin:$PATH" pnpm exec tsx scripts/backfill-item-market-tx.ts --help`  
(or `node_modules/.bin/tsx …` if pnpm missing)

Expected: usage text, exit code 2.

- [ ] **Step 5: Re-run walker tests + typecheck touch**

Run: `PATH="$PWD/node_modules/.bin:$PATH" vp test --dir src/jobs/item-market-tx`  
Expected: PASS.

Optional: `PATH="$PWD/node_modules/.bin:$PATH" vp check` if quick.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-item-market-tx.ts package.json docs/warera-api/inventory.md
git commit -m "$(cat <<'EOF'
feat: add manual item-market tx backfill CLI

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Until-date stop | Task 1 (`untilMs`) + Task 2 (`--until`) |
| Types trading / itemMarket / both | Task 2 |
| Delay + RPM tunable | Task 2 (`--delay-ms`, `--rpm` / config) |
| Shared client rate limits | Task 2 (`createWareraClient`) |
| Resume `--cursor` + print on stop | Task 1 abort + Task 2 SIGINT |
| No handoff flag flips | Task 2 (explicit non-goal) |
| inventory.md note | Task 2 |
| Reuse walker | Tasks 1–2 |

## Placeholder / consistency self-review

- No TBD steps; `createServerLogger` called out to match server boot.
- Stop reason `"until"` vs `"lookback"` consistent between tasks.
- `COMMODITY_TRANSACTION_TYPE` is `"trading"` — CLI `--type trading` maps to that constant.
