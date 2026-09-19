/**
 * One-shot SQLite dump → Postgres data copy (Turso backup file, not live Turso).
 *
 * Download a SQLite dump from the Turso dashboard / CLI first, then point this
 * script at the local file so cutover does not burn remote read quota.
 *
 * Env:
 *   DATABASE_URL         (required) — target Postgres connection string
 *   SQLITE_SOURCE_PATH   (optional) — local .db / .sqlite path if not passed as --sqlite
 *
 * Flags:
 *   --sqlite <path>      Local SQLite dump file (required unless SQLITE_SOURCE_PATH is set)
 *   --truncate           TRUNCATE all app tables (RESTART IDENTITY CASCADE) before copy
 *
 * Dry-run example (disposable PG must already have migrations applied):
 *
 *   set -a && source .env && set +a
 *   export DATABASE_URL=postgres://…   # staging / Testcontainers URL
 *   pnpm run db:migrate
 *   pnpm run migrate:turso-to-postgres -- --sqlite ./turso-backup.db --truncate
 *
 * Expectation: per-table source/dest counts match; money SUM spot-checks align
 * after Decimal coercion (SQLite real → PG numeric).
 */
import "dotenv/config";
import { createClient, type Client } from "@libsql/client";
import { Decimal } from "decimal.js";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const PAGE_SIZE = 1000;

/** Postgres `job_status` enum values (jobs.last_status / job_runs.status). */
const JOB_STATUS_VALUES = new Set(["success", "error", "running"]);
const JOB_STATUS_FALLBACK = "error";

type ColTransform = "timestamp" | "bool" | "json" | "money" | "job_status";

type TableSpec = {
  name: string;
  columns: string[];
  transforms: Partial<Record<string, ColTransform>>;
  /** Kept for readability; pagination uses SQLite rowid keyset. */
  orderBy: string;
  /** serial PK column for setval (if any) */
  serialColumn?: string;
  /** money columns to SUM for the checksum report */
  moneySumColumns?: string[];
};

const TABLES: TableSpec[] = [
  {
    name: "jobs",
    columns: [
      "id",
      "name",
      "description",
      "enabled",
      "cron",
      "max_runs",
      "last_started_at",
      "last_finished_at",
      "last_status",
      "last_error",
      "state",
    ],
    transforms: {
      enabled: "bool",
      last_started_at: "timestamp",
      last_finished_at: "timestamp",
      last_status: "job_status",
      state: "json",
    },
    orderBy: "id",
  },
  {
    name: "job_runs",
    columns: ["id", "job_id", "started_at", "finished_at", "status", "message", "duration_ms"],
    transforms: {
      started_at: "timestamp",
      finished_at: "timestamp",
      status: "job_status",
    },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "cache",
    columns: ["key", "payload", "fetched_at", "ttl_seconds", "tags"],
    transforms: { payload: "json", fetched_at: "timestamp" },
    orderBy: "key",
  },
  {
    name: "countries",
    columns: [
      "id",
      "name",
      "tax_rate",
      "iso_code",
      "source",
      "synced_at",
      "created_at",
      "updated_at",
    ],
    transforms: {
      synced_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    orderBy: "id",
  },
  {
    name: "price_polls",
    columns: ["id", "recorded_at", "status", "error", "item_count"],
    transforms: { recorded_at: "timestamp" },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "price_snapshots",
    columns: [
      "id",
      "poll_id",
      "item_code",
      "market_price",
      "buy_min",
      "buy_max",
      "buy_avg",
      "sell_min",
      "sell_max",
      "sell_avg",
    ],
    transforms: {
      market_price: "money",
      buy_min: "money",
      buy_max: "money",
      buy_avg: "money",
      sell_min: "money",
      sell_max: "money",
      sell_avg: "money",
    },
    orderBy: "id",
    serialColumn: "id",
    moneySumColumns: [
      "market_price",
      "buy_min",
      "buy_max",
      "buy_avg",
      "sell_min",
      "sell_max",
      "sell_avg",
    ],
  },
  {
    name: "recommended_regions",
    columns: ["item_code", "region_id", "region_name", "bonus", "payload", "fetched_at"],
    transforms: { payload: "json", fetched_at: "timestamp" },
    orderBy: "item_code",
  },
  {
    name: "regions",
    columns: ["id", "name", "country_code", "payload", "fetched_at", "enqueued_at"],
    transforms: {
      payload: "json",
      fetched_at: "timestamp",
      enqueued_at: "timestamp",
    },
    orderBy: "id",
  },
  {
    name: "company_packs",
    columns: ["user_id", "payload", "fetched_at", "ttl_seconds"],
    transforms: { payload: "json", fetched_at: "timestamp" },
    orderBy: "user_id",
  },
  {
    name: "mus",
    columns: [
      "id",
      "name",
      "avatar_url",
      "country_id",
      "region_id",
      "owner_user_id",
      "mercenary_reputation",
      "level",
      "created_at_game",
      "roles",
      "active_upgrade_levels",
      "payload",
      "enqueued_at",
      "fetched_at",
    ],
    transforms: {
      created_at_game: "timestamp",
      roles: "json",
      active_upgrade_levels: "json",
      payload: "json",
      enqueued_at: "timestamp",
      fetched_at: "timestamp",
    },
    orderBy: "id",
  },
  {
    name: "mu_members",
    columns: ["mu_id", "user_id", "role", "updated_at"],
    transforms: { updated_at: "timestamp" },
    orderBy: "mu_id, user_id",
  },
  {
    name: "mu_polls",
    columns: ["id", "recorded_at", "status", "error", "mu_count", "member_count"],
    transforms: { recorded_at: "timestamp" },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "mu_stat_snapshots",
    columns: [
      "id",
      "poll_id",
      "mu_id",
      "weekly_damages",
      "weekly_damages_rank",
      "weekly_damages_tier",
      "bounty",
      "bounty_rank",
      "bounty_tier",
      "reputation",
      "reputation_rank",
      "reputation_tier",
      "damages",
      "damages_rank",
      "damages_tier",
      "terrain",
      "terrain_rank",
      "terrain_tier",
      "wealth",
      "wealth_rank",
      "wealth_tier",
      "leveling_level",
      "leveling_monthly_damages",
      "payload",
    ],
    transforms: { payload: "json" },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "mu_member_stat_snapshots",
    columns: [
      "id",
      "poll_id",
      "mu_id",
      "user_id",
      "member_row_id",
      "total_damages_count",
      "monthly_damages_count",
      "weekly_damages_count",
      "total_help_count",
      "monthly_help_count",
      "weekly_help_count",
      "payload",
    ],
    transforms: { payload: "json" },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "user_profile_polls",
    columns: ["id", "recorded_at", "status", "error", "user_count", "mu_count"],
    transforms: { recorded_at: "timestamp" },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "user_profile_snapshots",
    columns: [
      "id",
      "poll_id",
      "user_id",
      "recorded_at",
      "username",
      "avatar_url",
      "country_id",
      "mu_id",
      "company_id",
      "party_id",
      "is_active",
      "last_connection_at",
      "last_work_at",
      "last_help_asked_at",
      "last_daily_reward_claimed_at",
      "last_company_joined_at",
      "last_daily_calendar_claimed_at",
      "last_skills_reset_at",
      "level",
      "total_xp",
      "daily_xp_left",
      "available_skill_points",
      "spent_skill_points",
      "total_skill_points",
      "prestige_level",
      "military_rank",
      "is_premium",
      "premium_months_count",
      "created_at_game",
    ],
    transforms: {
      recorded_at: "timestamp",
      is_active: "bool",
      last_connection_at: "timestamp",
      last_work_at: "timestamp",
      last_help_asked_at: "timestamp",
      last_daily_reward_claimed_at: "timestamp",
      last_company_joined_at: "timestamp",
      last_daily_calendar_claimed_at: "timestamp",
      last_skills_reset_at: "timestamp",
      is_premium: "bool",
      created_at_game: "timestamp",
    },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "players",
    columns: ["id", "username", "mu_id", "workplace_company_id", "payload", "fetched_at"],
    transforms: { payload: "json", fetched_at: "timestamp" },
    orderBy: "id",
  },
  {
    name: "player_watch_reasons",
    columns: ["player_id", "reason", "source_id", "last_touched_at", "created_at"],
    transforms: { last_touched_at: "timestamp", created_at: "timestamp" },
    orderBy: "player_id, reason, source_id",
  },
  {
    name: "mu_watch_reasons",
    columns: ["mu_id", "reason", "source_id", "last_touched_at", "created_at"],
    transforms: { last_touched_at: "timestamp", created_at: "timestamp" },
    orderBy: "mu_id, reason, source_id",
  },
  {
    name: "country_watch_reasons",
    columns: ["country_id", "reason", "source_id", "last_touched_at", "created_at"],
    transforms: { last_touched_at: "timestamp", created_at: "timestamp" },
    orderBy: "country_id, reason, source_id",
  },
  {
    name: "donation_polls",
    columns: ["id", "recorded_at", "status", "error", "scope_count", "row_count"],
    transforms: { recorded_at: "timestamp" },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "donation_snapshots",
    columns: [
      "id",
      "poll_id",
      "scope_type",
      "scope_id",
      "user_id",
      "donation_row_id",
      "amount",
      "donation_created_at",
      "donation_updated_at",
      "payload",
    ],
    transforms: {
      amount: "money",
      donation_created_at: "timestamp",
      donation_updated_at: "timestamp",
      payload: "json",
    },
    orderBy: "id",
    serialColumn: "id",
    moneySumColumns: ["amount"],
  },
  {
    name: "company_work_stats",
    columns: [
      "company_id",
      "daily_date",
      "automated_engine",
      "employee_prod",
      "self_work",
      "total",
      "wage",
      "payload",
      "fetched_at",
    ],
    transforms: { wage: "money", payload: "json", fetched_at: "timestamp" },
    orderBy: "company_id, daily_date",
    moneySumColumns: ["wage"],
  },
  {
    name: "worker_work_stats",
    columns: [
      "company_id",
      "worker_id",
      "daily_date",
      "employee_prod",
      "total",
      "wage",
      "payload",
      "fetched_at",
    ],
    transforms: { wage: "money", payload: "json", fetched_at: "timestamp" },
    orderBy: "company_id, worker_id, daily_date",
    moneySumColumns: ["wage"],
  },
  {
    name: "item_market_transactions",
    columns: [
      "id",
      "money",
      "item_code",
      "quantity",
      "seller_id",
      "buyer_id",
      "transaction_type",
      "item_id",
      "item_type",
      "item_state",
      "item_max_state",
      "item_quantity",
      "item_last_acquisition_at",
      "skills",
      "offer_created_at",
      "created_at",
      "updated_at",
      "payload",
      "ingested_at",
    ],
    transforms: {
      money: "money",
      item_last_acquisition_at: "timestamp",
      skills: "json",
      offer_created_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
      payload: "json",
      ingested_at: "timestamp",
    },
    orderBy: "id",
    moneySumColumns: ["money"],
  },
  {
    name: "battles",
    columns: [
      "id",
      "war_id",
      "type",
      "is_active",
      "attacker_country_id",
      "defender_country_id",
      "attacker_region_id",
      "defender_region_id",
      "rounds_to_win",
      "current_round_id",
      "current_round_number",
      "attacker_won_rounds",
      "defender_won_rounds",
      "attacker_mu_orders",
      "defender_mu_orders",
      "sticky_mu_ids",
      "rounds_history",
      "started_at_game",
      "ended_at",
      "finalized_at",
      "fetched_at",
      "payload",
    ],
    transforms: {
      is_active: "bool",
      attacker_mu_orders: "json",
      defender_mu_orders: "json",
      sticky_mu_ids: "json",
      rounds_history: "json",
      started_at_game: "timestamp",
      ended_at: "timestamp",
      finalized_at: "timestamp",
      fetched_at: "timestamp",
      payload: "json",
    },
    orderBy: "id",
  },
  {
    name: "battle_polls",
    columns: [
      "id",
      "recorded_at",
      "status",
      "error",
      "active_battle_pages",
      "battle_count",
      "loot_snapshot_count",
      "finalized_count",
    ],
    transforms: { recorded_at: "timestamp" },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "battle_scoreboard_snapshots",
    columns: [
      "id",
      "poll_id",
      "battle_id",
      "round_id",
      "round_number",
      "round_is_active",
      "attacker_points",
      "defender_points",
      "attacker_damages",
      "defender_damages",
      "attacker_hit_count",
      "defender_hit_count",
      "ticks_count",
      "next_tick_at",
      "round_started_at_game",
      "recorded_at",
    ],
    transforms: {
      round_is_active: "bool",
      next_tick_at: "timestamp",
      round_started_at_game: "timestamp",
      recorded_at: "timestamp",
    },
    orderBy: "id",
    serialColumn: "id",
  },
  {
    name: "battle_loot_snapshots",
    columns: [
      "id",
      "poll_id",
      "battle_id",
      "user_id",
      "mu_id",
      "total_dmg",
      "hits",
      "total_money_from_bounty",
      "total_money_from_contract",
      "case1_count",
      "case2_count",
      "pool_loot",
      "payload",
      "recorded_at",
    ],
    transforms: {
      total_money_from_bounty: "money",
      total_money_from_contract: "money",
      pool_loot: "json",
      payload: "json",
      recorded_at: "timestamp",
    },
    orderBy: "id",
    serialColumn: "id",
    moneySumColumns: ["total_money_from_bounty", "total_money_from_contract"],
  },
];

function parseArgs(argv: string[]): { truncate: boolean; sqlitePath: string | undefined } {
  let truncate = false;
  let sqlitePath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--truncate") {
      truncate = true;
    } else if (a === "--sqlite") {
      const next = argv[++i];
      if (!next || next.startsWith("-")) {
        console.error("--sqlite requires a file path");
        process.exit(2);
      }
      sqlitePath = next;
    } else if (a.startsWith("--sqlite=")) {
      sqlitePath = a.slice("--sqlite=".length);
      if (!sqlitePath) {
        console.error("--sqlite= requires a file path");
        process.exit(2);
      }
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: tsx scripts/migrate-turso-to-postgres.ts --sqlite <path> [--truncate]

Env: DATABASE_URL (required); SQLITE_SOURCE_PATH (optional alternative to --sqlite)
`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return { truncate, sqlitePath };
}

function resolveSqliteFileUrl(sqlitePath: string): string {
  const resolved = path.resolve(sqlitePath);
  if (!fs.existsSync(resolved)) {
    console.error(`SQLite dump not found: ${resolved}`);
    process.exit(2);
  }
  const st = fs.statSync(resolved);
  if (!st.isFile()) {
    console.error(`SQLite path is not a file: ${resolved}`);
    process.exit(2);
  }
  // libSQL file: URLs need an absolute path; pathToFileURL → file:///…
  return pathToFileURL(resolved).href;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(2);
  }
  return v;
}

function asMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function transformValue(
  value: unknown,
  kind: ColTransform | undefined,
  table: string,
  column: string,
): unknown {
  if (kind == null) {
    if (typeof value === "bigint") return Number(value);
    return value;
  }

  if (value == null) return null;

  switch (kind) {
    case "timestamp": {
      const ms = asMs(value);
      if (ms == null) {
        throw new Error(`${table}.${column}: invalid timestamp ${String(value)}`);
      }
      return new Date(ms);
    }
    case "bool": {
      if (typeof value === "boolean") return value;
      if (typeof value === "bigint") return Boolean(Number(value));
      if (typeof value === "number") return Boolean(value);
      if (typeof value === "string") {
        if (value === "1" || value.toLowerCase() === "true") return true;
        if (value === "0" || value.toLowerCase() === "false") return false;
      }
      return Boolean(value);
    }
    case "json": {
      // Always bind as a JSON text string + ::jsonb cast. Passing JS objects through
      // untyped $n placeholders becomes "[object Object]" and breaks inserts.
      if (value === "") return null;
      if (typeof value === "string") {
        JSON.parse(value); // validate
        return value;
      }
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
      throw new Error(`${table}.${column}: expected JSON text/object, got ${typeof value}`);
    }
    case "money": {
      return new Decimal(String(value)).toFixed();
    }
    case "job_status": {
      const raw = value == null ? null : String(value);
      if (raw == null || raw === "") return null;
      if (JOB_STATUS_VALUES.has(raw)) return raw;
      console.warn(
        `⚠ ${table}.${column}: unknown job_status ${JSON.stringify(raw)} → coercing to ${JOB_STATUS_FALLBACK}`,
      );
      return JOB_STATUS_FALLBACK;
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function transformRow(row: Record<string, unknown>, spec: TableSpec): unknown[] {
  return spec.columns.map((col) => transformValue(row[col], spec.transforms[col], spec.name, col));
}

async function sourceCount(turso: Client, table: string): Promise<number> {
  const rs = await turso.execute(`SELECT COUNT(*) AS c FROM "${table}"`);
  const c = rs.rows[0]?.c;
  if (typeof c === "bigint") return Number(c);
  return Number(c ?? 0);
}

async function destCount(pool: pg.Pool, table: string): Promise<number> {
  const rs = await pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM "${table}"`);
  return Number(rs.rows[0]?.c ?? 0);
}

async function sourceMoneySum(
  turso: Client,
  table: string,
  column: string,
): Promise<string | null> {
  // Fast SQL SUM; round to 6dp to match numeric(20,6) storage (spot-check, not bit-exact).
  const rs = await turso.execute(`SELECT SUM("${column}") AS s FROM "${table}"`);
  const s = rs.rows[0]?.s;
  if (s == null) return null;
  return new Decimal(String(s)).toDecimalPlaces(6).toFixed();
}

async function destMoneySum(pool: pg.Pool, table: string, column: string): Promise<string | null> {
  const rs = await pool.query<{ s: string | null }>(
    `SELECT SUM("${column}"::numeric)::text AS s FROM "${table}"`,
  );
  const s = rs.rows[0]?.s;
  if (s == null) return null;
  return new Decimal(s).toDecimalPlaces(6).toFixed();
}

async function truncateAll(pool: pg.Pool): Promise<void> {
  const names = TABLES.map((t) => `"${t.name}"`).join(", ");
  await pool.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  console.log(`Truncated ${TABLES.length} tables (RESTART IDENTITY CASCADE)`);
}

/**
 * Warn about legacy job_status values that are not in the PG enum.
 * Unknown values are coerced to `error` during transform so cutover can proceed.
 */
async function preflightJobStatuses(turso: Client): Promise<void> {
  const checks: Array<{ table: string; column: string }> = [
    { table: "jobs", column: "last_status" },
    { table: "job_runs", column: "status" },
  ];

  for (const { table, column } of checks) {
    let rs;
    try {
      rs = await turso.execute(
        `SELECT DISTINCT "${column}" AS v FROM "${table}" WHERE "${column}" IS NOT NULL`,
      );
    } catch (err) {
      console.warn(`job_status preflight skipped for ${table}.${column}: ${String(err)}`);
      continue;
    }

    const unknown = new Map<string, number>();
    for (const row of rs.rows) {
      const raw = row.v;
      if (raw == null) continue;
      const v = String(raw);
      if (!JOB_STATUS_VALUES.has(v)) {
        unknown.set(v, (unknown.get(v) ?? 0) + 1);
      }
    }

    if (unknown.size === 0) {
      console.log(`job_status preflight ${table}.${column}: all values ok`);
      continue;
    }

    const report = [...unknown.entries()]
      .map(([v]) => JSON.stringify(v))
      .sort()
      .join(", ");
    console.warn(
      `⚠ job_status preflight ${table}.${column}: unknown values [${report}] will be coerced to ${JOB_STATUS_FALLBACK}`,
    );
  }
}

async function copyTable(
  turso: Client,
  pool: pg.Pool,
  spec: TableSpec,
): Promise<{ inserted: number }> {
  const colList = spec.columns.map((c) => `"${c}"`).join(", ");
  let lastRowid = 0;
  let batchIndex = 0;
  let inserted = 0;

  for (;;) {
    // Keyset on SQLite rowid — OFFSET over ~1M rows is unusably slow on Turso.
    const selectSql = `SELECT ${colList}, rowid AS _migrate_rowid FROM "${spec.name}" WHERE rowid > ? ORDER BY rowid LIMIT ?`;
    let rs;
    try {
      rs = await turso.execute({ sql: selectSql, args: [lastRowid, PAGE_SIZE] });
    } catch (err) {
      throw new Error(
        `Turso SELECT failed for ${spec.name} batch ${batchIndex} (after rowid ${lastRowid}): ${String(err)}`,
      );
    }

    if (rs.rows.length === 0) break;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let param = 1;

    for (const raw of rs.rows) {
      const row = raw as unknown as Record<string, unknown>;
      const rowidRaw = row._migrate_rowid;
      const rowid =
        typeof rowidRaw === "bigint"
          ? Number(rowidRaw)
          : typeof rowidRaw === "number"
            ? rowidRaw
            : Number(rowidRaw);
      if (Number.isFinite(rowid)) lastRowid = rowid;

      let cells: unknown[];
      try {
        cells = transformRow(row, spec);
      } catch (err) {
        throw new Error(`Transform failed for ${spec.name} batch ${batchIndex}: ${String(err)}`);
      }
      const rowPlaceholders = spec.columns.map((col) => {
        const n = param++;
        const kind = spec.transforms[col];
        if (kind === "json") return `$${n}::jsonb`;
        if (kind === "money") return `$${n}::numeric`;
        if (kind === "timestamp") return `$${n}::timestamptz`;
        if (kind === "bool") return `$${n}::boolean`;
        return `$${n}`;
      });
      placeholders.push(`(${rowPlaceholders.join(", ")})`);
      values.push(...cells);
    }

    const insertSql = `INSERT INTO "${spec.name}" (${colList}) VALUES ${placeholders.join(", ")}`;
    try {
      await pool.query(insertSql, values);
    } catch (err) {
      throw new Error(
        `Postgres INSERT failed for ${spec.name} batch ${batchIndex} (after rowid ${lastRowid}): ${String(err)}`,
      );
    }

    inserted += rs.rows.length;
    batchIndex += 1;

    if (batchIndex % 50 === 0) {
      console.log(`  … ${spec.name}: ${inserted} rows`);
    }

    if (rs.rows.length < PAGE_SIZE) break;
  }

  return { inserted };
}

async function resetSequences(pool: pg.Pool): Promise<void> {
  for (const spec of TABLES) {
    if (!spec.serialColumn) continue;
    const col = spec.serialColumn;
    const seqRs = await pool.query<{ seq: string | null }>(
      `SELECT pg_get_serial_sequence($1, $2) AS seq`,
      [spec.name, col],
    );
    const seq = seqRs.rows[0]?.seq;
    if (!seq) {
      console.warn(`No serial sequence for ${spec.name}.${col}; skipping setval`);
      continue;
    }
    const maxRs = await pool.query<{ m: string | null }>(
      `SELECT MAX("${col}")::text AS m FROM "${spec.name}"`,
    );
    const max = maxRs.rows[0]?.m;
    if (max == null) {
      // empty table — leave sequence at default
      continue;
    }
    await pool.query(`SELECT setval($1::regclass, $2::bigint, true)`, [seq, max]);
    console.log(`setval ${seq} = ${max}`);
  }
}

async function main(): Promise<void> {
  const { truncate, sqlitePath: sqliteArg } = parseArgs(process.argv.slice(2));
  const sqlitePath = sqliteArg ?? process.env.SQLITE_SOURCE_PATH;
  if (!sqlitePath) {
    console.error("Missing SQLite dump path: pass --sqlite <path> or set SQLITE_SOURCE_PATH");
    process.exit(2);
  }
  const sqliteUrl = resolveSqliteFileUrl(sqlitePath);
  const databaseUrl = requireEnv("DATABASE_URL");

  console.log(`Source SQLite: ${sqliteUrl}`);
  const source = createClient({ url: sqliteUrl });
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    if (truncate) {
      await truncateAll(pool);
    }

    await preflightJobStatuses(source);

    console.log("");
    console.log(
      "table".padEnd(32) + "source".padStart(10) + "dest".padStart(10) + "  money checksums",
    );
    console.log("-".repeat(90));

    for (const spec of TABLES) {
      const src = await sourceCount(source, spec.name);
      const { inserted } = await copyTable(source, pool, spec);
      const dst = await destCount(pool, spec.name);

      let moneyNote = "";
      if (spec.moneySumColumns?.length) {
        const parts: string[] = [];
        for (const col of spec.moneySumColumns) {
          const sSum = await sourceMoneySum(source, spec.name, col);
          const dSum = await destMoneySum(pool, spec.name, col);
          const ok = sSum === dSum ? "ok" : "MISMATCH";
          parts.push(`${col}: src=${sSum ?? "null"} dst=${dSum ?? "null"} (${ok})`);
        }
        moneyNote = parts.join("; ");
      }

      const match = src === dst && inserted === dst ? "" : " ⚠ COUNT MISMATCH";
      console.log(
        spec.name.padEnd(32) +
          String(src).padStart(10) +
          String(dst).padStart(10) +
          (moneyNote ? `  ${moneyNote}` : "") +
          match,
      );

      if (src !== dst) {
        throw new Error(`Count mismatch for ${spec.name}: source=${src} dest=${dst}`);
      }
    }

    console.log("");
    await resetSequences(pool);
    console.log("");
    console.log("Migration copy complete.");
  } finally {
    await pool.end();
    source.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
