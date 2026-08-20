import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobStatuses = ["success", "error", "running"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  cron: text("cron").notNull(),
  maxRuns: integer("max_runs"),
  lastStartedAt: integer("last_started_at", { mode: "timestamp_ms" }),
  lastFinishedAt: integer("last_finished_at", { mode: "timestamp_ms" }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  state: text("state", { mode: "json" }).$type<Record<string, unknown> | null>(),
});

export const jobRuns = sqliteTable("job_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  status: text("status").notNull(),
  message: text("message"),
  durationMs: integer("duration_ms"),
});

export const cache = sqliteTable("cache", {
  key: text("key").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull(),
  tags: text("tags"),
});

export const countrySources = ["warera", "manual"] as const;
export type CountrySource = (typeof countrySources)[number];

export const countries = sqliteTable("countries", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  taxRate: real("tax_rate").notNull(),
  isoCode: text("iso_code"),
  source: text("source").notNull().default("manual"),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pricePollStatuses = ["success", "partial", "error"] as const;
export type PricePollStatus = (typeof pricePollStatuses)[number];

export const pricePolls = sqliteTable(
  "price_polls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    error: text("error"),
    itemCount: integer("item_count").notNull().default(0),
  },
  (t) => [index("price_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const priceSnapshots = sqliteTable("price_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pollId: integer("poll_id")
    .notNull()
    .references(() => pricePolls.id),
  itemCode: text("item_code").notNull(),
  marketPrice: real("market_price"),
  buyMin: real("buy_min"),
  buyMax: real("buy_max"),
  buyAvg: real("buy_avg"),
  sellMin: real("sell_min"),
  sellMax: real("sell_max"),
  sellAvg: real("sell_avg"),
});

export const recommendedRegions = sqliteTable("recommended_regions", {
  itemCode: text("item_code").primaryKey(),
  regionId: text("region_id").notNull(),
  regionName: text("region_name"),
  bonus: real("bonus"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const regions = sqliteTable("regions", {
  id: text("id").primaryKey(),
  name: text("name"),
  countryCode: text("country_code"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
  enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" }).notNull(),
});

export const companyPacks = sqliteTable("company_packs", {
  userId: text("user_id").primaryKey(),
  payload: text("payload", { mode: "json" }).notNull().$type<unknown>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull().default(600),
});

export const muPollStatuses = ["success", "partial", "error"] as const;
export type MuPollStatus = (typeof muPollStatuses)[number];

export const mus = sqliteTable("mus", {
  id: text("id").primaryKey(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  countryId: text("country_id"),
  regionId: text("region_id"),
  ownerUserId: text("owner_user_id"),
  mercenaryReputation: real("mercenary_reputation"),
  level: integer("level"),
  createdAtGame: integer("created_at_game", { mode: "timestamp_ms" }),
  roles: text("roles", { mode: "json" }).$type<Record<string, unknown> | null>(),
  activeUpgradeLevels: text("active_upgrade_levels", {
    mode: "json",
  }).$type<Record<string, unknown> | null>(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
});

export const muMembers = sqliteTable(
  "mu_members",
  {
    muId: text("mu_id")
      .notNull()
      .references(() => mus.id),
    userId: text("user_id").notNull(),
    role: text("role"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.muId, t.userId] })],
);

export const muPolls = sqliteTable(
  "mu_polls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    error: text("error"),
    muCount: integer("mu_count").notNull().default(0),
    memberCount: integer("member_count").notNull().default(0),
  },
  (t) => [index("mu_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const muStatSnapshots = sqliteTable(
  "mu_stat_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => muPolls.id),
    muId: text("mu_id").notNull(),
    weeklyDamages: real("weekly_damages"),
    weeklyDamagesRank: integer("weekly_damages_rank"),
    weeklyDamagesTier: text("weekly_damages_tier"),
    bounty: real("bounty"),
    bountyRank: integer("bounty_rank"),
    bountyTier: text("bounty_tier"),
    reputation: real("reputation"),
    reputationRank: integer("reputation_rank"),
    reputationTier: text("reputation_tier"),
    damages: real("damages"),
    damagesRank: integer("damages_rank"),
    damagesTier: text("damages_tier"),
    terrain: real("terrain"),
    terrainRank: integer("terrain_rank"),
    terrainTier: text("terrain_tier"),
    wealth: real("wealth"),
    wealthRank: integer("wealth_rank"),
    wealthTier: text("wealth_tier"),
    levelingLevel: integer("leveling_level"),
    levelingMonthlyDamages: real("leveling_monthly_damages"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (t) => [index("mu_stat_snapshots_mu_poll_idx").on(t.muId, t.pollId)],
);

export const muMemberStatSnapshots = sqliteTable(
  "mu_member_stat_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pollId: integer("poll_id")
      .notNull()
      .references(() => muPolls.id),
    muId: text("mu_id").notNull(),
    userId: text("user_id").notNull(),
    memberRowId: text("member_row_id"),
    totalDamagesCount: integer("total_damages_count"),
    monthlyDamagesCount: integer("monthly_damages_count"),
    weeklyDamagesCount: integer("weekly_damages_count"),
    totalHelpCount: integer("total_help_count"),
    monthlyHelpCount: integer("monthly_help_count"),
    weeklyHelpCount: integer("weekly_help_count"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (t) => [index("mu_member_stat_snapshots_mu_user_poll_idx").on(t.muId, t.userId, t.pollId)],
);

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  username: text("username"),
  muId: text("mu_id"),
  workplaceCompanyId: text("workplace_company_id"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }),
});

export const playerWatchReasons = sqliteTable(
  "player_watch_reasons",
  {
    playerId: text("player_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.reason, t.sourceId] })],
);

export const muWatchReasons = sqliteTable(
  "mu_watch_reasons",
  {
    muId: text("mu_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.muId, t.reason, t.sourceId] })],
);

export const companyWorkStats = sqliteTable(
  "company_work_stats",
  {
    companyId: text("company_id").notNull(),
    dailyDate: text("daily_date").notNull(),
    automatedEngine: real("automated_engine"),
    employeeProd: real("employee_prod"),
    selfWork: real("self_work"),
    total: real("total"),
    wage: real("wage"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.dailyDate] })],
);

export const workerWorkStats = sqliteTable(
  "worker_work_stats",
  {
    companyId: text("company_id").notNull(),
    workerId: text("worker_id").notNull(),
    dailyDate: text("daily_date").notNull(),
    employeeProd: real("employee_prod"),
    total: real("total"),
    wage: real("wage"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.workerId, t.dailyDate] })],
);

export const itemMarketTransactions = sqliteTable(
  "item_market_transactions",
  {
    id: text("id").primaryKey(),
    money: real("money").notNull(),
    itemCode: text("item_code").notNull(),
    quantity: integer("quantity").notNull(),
    sellerId: text("seller_id").notNull(),
    buyerId: text("buyer_id").notNull(),
    transactionType: text("transaction_type").notNull(),
    itemId: text("item_id").notNull(),
    itemType: text("item_type"),
    itemState: integer("item_state"),
    itemMaxState: integer("item_max_state"),
    itemQuantity: integer("item_quantity"),
    itemLastAcquisitionAt: integer("item_last_acquisition_at", { mode: "timestamp_ms" }),
    skills: text("skills", { mode: "json" }).$type<Record<string, unknown> | null>(),
    offerCreatedAt: integer("offer_created_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown> | null>(),
    ingestedAt: integer("ingested_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("item_market_tx_item_code_created_at_idx").on(t.itemCode, t.createdAt),
    index("item_market_tx_created_at_idx").on(t.createdAt),
  ],
);
