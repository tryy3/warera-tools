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
  const base = loadConfig();
  const config =
    args.rpm != null ? { ...base, wareraMaxRequestsPerMinute: args.rpm } : base;

  const logger = createServerLogger(config);
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
          fetchItemMarketTransactionsPage(
            warera,
            { ...opts, transactionType: apiType },
            { callClass: "background" },
          ),
      });

      summaries.push(
        `${transactionType}: inserted=${result.inserted} pages=${result.pages} reason=${result.stoppedReason} resumeCursor=${result.resumeCursor ?? ""}`,
      );
      console.log(summaries.at(-1));

      if (result.stoppedReason === "aborted") {
        const resumeHint =
          result.resumeCursor != null
            ? `Resume with: --type ${transactionType} --cursor ${JSON.stringify(result.resumeCursor)} --until ${args.until.toISOString()}`
            : `Stopped early. Restart from tip (omit --cursor) with: --type ${transactionType} --until ${args.until.toISOString()}`;
        console.error(resumeHint);
        process.exitCode = 130;
        break;
      }

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
