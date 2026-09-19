import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { moneyNumeric } from "./money-column";

export const jobStatuses = ["success", "error", "running"] as const;
export type JobStatus = (typeof jobStatuses)[number];
export const jobStatusEnum = pgEnum("job_status", jobStatuses);

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  cron: text("cron").notNull(),
  maxRuns: integer("max_runs"),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: "date" }),
  lastFinishedAt: timestamp("last_finished_at", { withTimezone: true, mode: "date" }),
  lastStatus: jobStatusEnum("last_status"),
  lastError: text("last_error"),
  state: jsonb("state").$type<Record<string, unknown> | null>(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    status: jobStatusEnum("status").notNull(),
    message: text("message"),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("job_runs_job_id_started_at_id_idx").on(t.jobId, t.startedAt, t.id)],
);

export const cache = pgTable("cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull(),
  tags: text("tags"),
});

export const countrySources = ["warera", "manual"] as const;
export type CountrySource = (typeof countrySources)[number];

export const countries = pgTable("countries", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  taxRate: doublePrecision("tax_rate").notNull(),
  isoCode: text("iso_code"),
  source: text("source").notNull().default("manual"),
  syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pricePollStatuses = ["success", "partial", "error"] as const;
export type PricePollStatus = (typeof pricePollStatuses)[number];
export const pollStatusEnum = pgEnum("poll_status", pricePollStatuses);

export const pricePolls = pgTable(
  "price_polls",
  {
    id: serial("id").primaryKey(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    status: pollStatusEnum("status").notNull(),
    error: text("error"),
    itemCount: integer("item_count").notNull().default(0),
  },
  (t) => [index("price_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const priceSnapshots = pgTable("price_snapshots", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .notNull()
    .references(() => pricePolls.id),
  itemCode: text("item_code").notNull(),
  marketPrice: moneyNumeric("market_price"),
  buyMin: moneyNumeric("buy_min"),
  buyMax: moneyNumeric("buy_max"),
  buyAvg: moneyNumeric("buy_avg"),
  sellMin: moneyNumeric("sell_min"),
  sellMax: moneyNumeric("sell_max"),
  sellAvg: moneyNumeric("sell_avg"),
});

export const recommendedRegions = pgTable("recommended_regions", {
  itemCode: text("item_code").primaryKey(),
  regionId: text("region_id").notNull(),
  regionName: text("region_name"),
  bonus: doublePrecision("bonus"),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const regions = pgTable("regions", {
  id: text("id").primaryKey(),
  name: text("name"),
  countryCode: text("country_code"),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }),
  enqueuedAt: timestamp("enqueued_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const companyPacks = pgTable("company_packs", {
  userId: text("user_id").primaryKey(),
  payload: jsonb("payload").notNull().$type<unknown>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull(),
  ttlSeconds: integer("ttl_seconds").notNull().default(600),
});

export const muPollStatuses = ["success", "partial", "error"] as const;
export type MuPollStatus = (typeof muPollStatuses)[number];

export const mus = pgTable("mus", {
  id: text("id").primaryKey(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  countryId: text("country_id"),
  regionId: text("region_id"),
  ownerUserId: text("owner_user_id"),
  mercenaryReputation: doublePrecision("mercenary_reputation"),
  level: integer("level"),
  createdAtGame: timestamp("created_at_game", { withTimezone: true, mode: "date" }),
  roles: jsonb("roles").$type<Record<string, unknown> | null>(),
  activeUpgradeLevels: jsonb("active_upgrade_levels").$type<Record<string, unknown> | null>(),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  enqueuedAt: timestamp("enqueued_at", { withTimezone: true, mode: "date" }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }),
});

export const muMembers = pgTable(
  "mu_members",
  {
    muId: text("mu_id")
      .notNull()
      .references(() => mus.id),
    userId: text("user_id").notNull(),
    role: text("role"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.muId, t.userId] })],
);

export const muPolls = pgTable(
  "mu_polls",
  {
    id: serial("id").primaryKey(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    status: pollStatusEnum("status").notNull(),
    error: text("error"),
    muCount: integer("mu_count").notNull().default(0),
    memberCount: integer("member_count").notNull().default(0),
  },
  (t) => [index("mu_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const muStatSnapshots = pgTable(
  "mu_stat_snapshots",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => muPolls.id),
    muId: text("mu_id").notNull(),
    weeklyDamages: doublePrecision("weekly_damages"),
    weeklyDamagesRank: integer("weekly_damages_rank"),
    weeklyDamagesTier: text("weekly_damages_tier"),
    bounty: doublePrecision("bounty"),
    bountyRank: integer("bounty_rank"),
    bountyTier: text("bounty_tier"),
    reputation: doublePrecision("reputation"),
    reputationRank: integer("reputation_rank"),
    reputationTier: text("reputation_tier"),
    damages: doublePrecision("damages"),
    damagesRank: integer("damages_rank"),
    damagesTier: text("damages_tier"),
    terrain: doublePrecision("terrain"),
    terrainRank: integer("terrain_rank"),
    terrainTier: text("terrain_tier"),
    wealth: doublePrecision("wealth"),
    wealthRank: integer("wealth_rank"),
    wealthTier: text("wealth_tier"),
    levelingLevel: integer("leveling_level"),
    levelingMonthlyDamages: doublePrecision("leveling_monthly_damages"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  },
  (t) => [index("mu_stat_snapshots_mu_poll_idx").on(t.muId, t.pollId)],
);

export const muMemberStatSnapshots = pgTable(
  "mu_member_stat_snapshots",
  {
    id: serial("id").primaryKey(),
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
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  },
  (t) => [index("mu_member_stat_snapshots_mu_user_poll_idx").on(t.muId, t.userId, t.pollId)],
);

export const userProfilePolls = pgTable(
  "user_profile_polls",
  {
    id: serial("id").primaryKey(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    status: pollStatusEnum("status").notNull(),
    error: text("error"),
    userCount: integer("user_count").notNull().default(0),
    muCount: integer("mu_count").notNull().default(0),
  },
  (t) => [index("user_profile_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const userProfileSnapshots = pgTable(
  "user_profile_snapshots",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => userProfilePolls.id),
    userId: text("user_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    countryId: text("country_id"),
    muId: text("mu_id"),
    companyId: text("company_id"),
    partyId: text("party_id"),
    isActive: boolean("is_active"),
    lastConnectionAt: timestamp("last_connection_at", { withTimezone: true, mode: "date" }),
    lastWorkAt: timestamp("last_work_at", { withTimezone: true, mode: "date" }),
    lastHelpAskedAt: timestamp("last_help_asked_at", { withTimezone: true, mode: "date" }),
    lastDailyRewardClaimedAt: timestamp("last_daily_reward_claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastCompanyJoinedAt: timestamp("last_company_joined_at", { withTimezone: true, mode: "date" }),
    lastDailyCalendarClaimedAt: timestamp("last_daily_calendar_claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastSkillsResetAt: timestamp("last_skills_reset_at", { withTimezone: true, mode: "date" }),
    level: integer("level"),
    totalXp: integer("total_xp"),
    dailyXpLeft: integer("daily_xp_left"),
    availableSkillPoints: integer("available_skill_points"),
    spentSkillPoints: integer("spent_skill_points"),
    totalSkillPoints: integer("total_skill_points"),
    prestigeLevel: integer("prestige_level"),
    militaryRank: integer("military_rank"),
    isPremium: boolean("is_premium"),
    premiumMonthsCount: integer("premium_months_count"),
    createdAtGame: timestamp("created_at_game", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("user_profile_snapshots_user_recorded_at_idx").on(t.userId, t.recordedAt),
    index("user_profile_snapshots_poll_idx").on(t.pollId),
    index("user_profile_snapshots_mu_recorded_at_idx").on(t.muId, t.recordedAt),
  ],
);

export const userFightPolls = pgTable(
  "user_fight_polls",
  {
    id: serial("id").primaryKey(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    status: pollStatusEnum("status").notNull(),
    error: text("error"),
    userCount: integer("user_count").notNull().default(0),
    muCount: integer("mu_count").notNull().default(0),
  },
  (t) => [index("user_fight_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const userFightSnapshots = pgTable(
  "user_fight_snapshots",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => userFightPolls.id),
    userId: text("user_id").notNull(),
    muId: text("mu_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    username: text("username").notNull(),
    level: integer("level").notNull(),
    militaryRankBonus: doublePrecision("military_rank_bonus").notNull(),
    ammoLabel: text("ammo_label"),
    pillLabel: text("pill_label"),
    pillEndsAt: timestamp("pill_ends_at", { withTimezone: true, mode: "date" }),
    skillLevels: jsonb("skill_levels").notNull().$type<Record<string, number>>(),
    lastSkillsResetAt: timestamp("last_skills_reset_at", { withTimezone: true, mode: "date" }),
    avatarUrl: text("avatar_url"),
    atk: doublePrecision("atk").notNull(),
    precision: doublePrecision("precision").notNull(),
    critChance: doublePrecision("crit_chance").notNull(),
    critDamage: doublePrecision("crit_damage").notNull(),
    armor: doublePrecision("armor").notNull(),
    dodge: doublePrecision("dodge").notNull(),
    hp: doublePrecision("hp").notNull(),
    maxHp: doublePrecision("max_hp").notNull(),
    hunger: doublePrecision("hunger").notNull(),
    maxHunger: doublePrecision("max_hunger").notNull(),
    hpRegenPerHour: doublePrecision("hp_regen_per_hour").notNull(),
    hungerRegenPerHour: doublePrecision("hunger_regen_per_hour").notNull(),
    pillStatus: text("pill_status").notNull().$type<"active" | "debuff" | "ready">(),
  },
  (t) => [
    index("user_fight_snapshots_user_recorded_at_idx").on(t.userId, t.recordedAt),
    index("user_fight_snapshots_poll_idx").on(t.pollId),
    index("user_fight_snapshots_mu_recorded_at_idx").on(t.muId, t.recordedAt),
  ],
);

export const players = pgTable("players", {
  id: text("id").primaryKey(),
  username: text("username"),
  muId: text("mu_id"),
  workplaceCompanyId: text("workplace_company_id"),
  payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }),
});

export const playerWatchReasons = pgTable(
  "player_watch_reasons",
  {
    playerId: text("player_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: timestamp("last_touched_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.reason, t.sourceId] })],
);

export const muWatchReasons = pgTable(
  "mu_watch_reasons",
  {
    muId: text("mu_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: timestamp("last_touched_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.muId, t.reason, t.sourceId] })],
);

export const countryWatchReasons = pgTable(
  "country_watch_reasons",
  {
    countryId: text("country_id").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull(),
    lastTouchedAt: timestamp("last_touched_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.countryId, t.reason, t.sourceId] })],
);

export const donationPolls = pgTable(
  "donation_polls",
  {
    id: serial("id").primaryKey(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    status: pollStatusEnum("status").notNull(),
    error: text("error"),
    scopeCount: integer("scope_count").notNull().default(0),
    rowCount: integer("row_count").notNull().default(0),
  },
  (t) => [index("donation_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const donationSnapshots = pgTable(
  "donation_snapshots",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => donationPolls.id),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    userId: text("user_id").notNull(),
    donationRowId: text("donation_row_id"),
    amount: moneyNumeric("amount"),
    donationCreatedAt: timestamp("donation_created_at", { withTimezone: true, mode: "date" }),
    donationUpdatedAt: timestamp("donation_updated_at", { withTimezone: true, mode: "date" }),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  },
  (t) => [
    index("donation_snapshots_scope_user_poll_idx").on(t.scopeType, t.scopeId, t.userId, t.pollId),
  ],
);

export const companyWorkStats = pgTable(
  "company_work_stats",
  {
    companyId: text("company_id").notNull(),
    dailyDate: text("daily_date").notNull(),
    automatedEngine: doublePrecision("automated_engine"),
    employeeProd: doublePrecision("employee_prod"),
    selfWork: doublePrecision("self_work"),
    total: doublePrecision("total"),
    wage: moneyNumeric("wage"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.dailyDate] })],
);

export const workerWorkStats = pgTable(
  "worker_work_stats",
  {
    companyId: text("company_id").notNull(),
    workerId: text("worker_id").notNull(),
    dailyDate: text("daily_date").notNull(),
    employeeProd: doublePrecision("employee_prod"),
    total: doublePrecision("total"),
    wage: moneyNumeric("wage"),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.workerId, t.dailyDate] })],
);

export const itemMarketTransactions = pgTable(
  "item_market_transactions",
  {
    id: text("id").primaryKey(),
    money: moneyNumeric("money").notNull(),
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
    itemLastAcquisitionAt: timestamp("item_last_acquisition_at", {
      withTimezone: true,
      mode: "date",
    }),
    skills: jsonb("skills").$type<Record<string, unknown> | null>(),
    offerCreatedAt: timestamp("offer_created_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("item_market_tx_item_code_created_at_idx").on(t.itemCode, t.createdAt),
    index("item_market_tx_created_at_idx").on(t.createdAt),
    index("item_market_tx_buyer_item_created_at_idx").on(t.buyerId, t.itemCode, t.createdAt),
    index("item_market_tx_seller_item_created_at_idx").on(t.sellerId, t.itemCode, t.createdAt),
  ],
);

export const battlePollStatuses = ["success", "partial", "error"] as const;
export type BattlePollStatus = (typeof battlePollStatuses)[number];

export const battles = pgTable(
  "battles",
  {
    id: text("id").primaryKey(),
    warId: text("war_id"),
    type: text("type"),
    isActive: boolean("is_active").notNull().default(true),
    attackerCountryId: text("attacker_country_id"),
    defenderCountryId: text("defender_country_id"),
    attackerRegionId: text("attacker_region_id"),
    defenderRegionId: text("defender_region_id"),
    roundsToWin: integer("rounds_to_win"),
    currentRoundId: text("current_round_id"),
    currentRoundNumber: integer("current_round_number"),
    attackerWonRounds: integer("attacker_won_rounds"),
    defenderWonRounds: integer("defender_won_rounds"),
    attackerMuOrders: jsonb("attacker_mu_orders").$type<string[] | null>(),
    defenderMuOrders: jsonb("defender_mu_orders").$type<string[] | null>(),
    stickyMuIds: jsonb("sticky_mu_ids").$type<string[] | null>(),
    roundsHistory: jsonb("rounds_history").$type<unknown[] | null>(),
    startedAtGame: timestamp("started_at_game", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: "date" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
  },
  (t) => [index("battles_is_active_idx").on(t.isActive)],
);

export const battlePolls = pgTable(
  "battle_polls",
  {
    id: serial("id").primaryKey(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    status: pollStatusEnum("status").notNull(),
    error: text("error"),
    activeBattlePages: integer("active_battle_pages"),
    battleCount: integer("battle_count").notNull().default(0),
    lootSnapshotCount: integer("loot_snapshot_count").notNull().default(0),
    finalizedCount: integer("finalized_count").notNull().default(0),
  },
  (t) => [index("battle_polls_status_recorded_at_idx").on(t.status, t.recordedAt)],
);

export const battleScoreboardSnapshots = pgTable(
  "battle_scoreboard_snapshots",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => battlePolls.id),
    battleId: text("battle_id").notNull(),
    roundId: text("round_id"),
    roundNumber: integer("round_number"),
    roundIsActive: boolean("round_is_active"),
    attackerPoints: doublePrecision("attacker_points"),
    defenderPoints: doublePrecision("defender_points"),
    attackerDamages: doublePrecision("attacker_damages"),
    defenderDamages: doublePrecision("defender_damages"),
    attackerHitCount: integer("attacker_hit_count"),
    defenderHitCount: integer("defender_hit_count"),
    ticksCount: integer("ticks_count"),
    nextTickAt: timestamp("next_tick_at", { withTimezone: true, mode: "date" }),
    roundStartedAtGame: timestamp("round_started_at_game", { withTimezone: true, mode: "date" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("battle_scoreboard_snapshots_battle_poll_idx").on(t.battleId, t.pollId),
    index("battle_scoreboard_snapshots_battle_recorded_at_idx").on(t.battleId, t.recordedAt),
  ],
);

export const battleLootSnapshots = pgTable(
  "battle_loot_snapshots",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => battlePolls.id),
    battleId: text("battle_id").notNull(),
    userId: text("user_id").notNull(),
    muId: text("mu_id").notNull(),
    totalDmg: doublePrecision("total_dmg"),
    hits: integer("hits"),
    totalMoneyFromBounty: moneyNumeric("total_money_from_bounty"),
    totalMoneyFromContract: moneyNumeric("total_money_from_contract"),
    case1Count: integer("case1_count"),
    case2Count: integer("case2_count"),
    poolLoot: jsonb("pool_loot").$type<unknown[] | null>(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("battle_loot_snapshots_battle_user_poll_idx").on(t.battleId, t.userId, t.pollId),
    index("battle_loot_snapshots_mu_recorded_at_idx").on(t.muId, t.recordedAt),
  ],
);
