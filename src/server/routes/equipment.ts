import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { GearTierId } from "../../calculator";
import type { Db } from "../../db/client";
import { listItemMarketTxSince } from "../../db/item-market-tx-read";
import { getLatestItemMarketPrice } from "../../db/prices";
import { countries } from "../../db/schema";
import { buildCraftCompare } from "../../equipment/craft";
import { buildEquipmentDetail } from "../../equipment/detail";
import { buildEquipmentOverview } from "../../equipment/overview";
import type { SkillBand } from "../../equipment/skills";
import { MARKET_WINDOW_MS, TREND_LOOKBACK_MS } from "../../equipment/windows";
import type { Logger } from "../../logging/logger";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

const GEAR_TIERS = new Set(["gray", "green", "blue", "purple", "yellow", "red"]);

export type EquipmentRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

function parseSkillsQuery(raw: string | undefined): SkillBand[] | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) throw new Error("not array");
    return v.map((row) => {
      const r = row as SkillBand;
      if (typeof r.key !== "string" || typeof r.target !== "number" || typeof r.band !== "number") {
        throw new Error("bad band");
      }
      return { key: r.key, target: r.target, band: r.band };
    });
  } catch {
    throw new HttpError(400, "bad_request", "skills must be a JSON array of {key,target,band}");
  }
}

export function equipmentRoutes(deps: EquipmentRouteDeps) {
  const { db } = deps;
  const app = new Hono();

  app.get("/overview", async (c) => {
    const now = Date.now();
    const since = new Date(now - MARKET_WINDOW_MS);
    const txs = await listItemMarketTxSince(db, since);
    const scrap = await getLatestItemMarketPrice(db, "scraps");
    const items = buildEquipmentOverview(txs, scrap?.price ?? null);
    return c.json({
      windowMs: MARKET_WINDOW_MS,
      scrapPrice: scrap?.price ?? null,
      scrapedAt: scrap?.fetchedAt?.toISOString() ?? null,
      items,
    });
  });

  app.get("/craft-compare", async (c) => {
    const tierRaw = c.req.query("tier")?.trim() ?? "";
    const countryId = c.req.query("countryId")?.trim() ?? "";
    if (!GEAR_TIERS.has(tierRaw)) {
      throw new HttpError(400, "bad_request", "tier must be a gear tier id");
    }
    if (!countryId) {
      throw new HttpError(400, "bad_request", "countryId is required");
    }
    const tier = tierRaw as GearTierId;

    const rows = await db
      .select({ taxRate: countries.taxRate })
      .from(countries)
      .where(eq(countries.id, countryId))
      .limit(1);
    if (!rows[0]) {
      throw new HttpError(400, "bad_request", "unknown countryId");
    }
    const taxRate = rows[0].taxRate;

    const now = Date.now();
    const since = new Date(now - MARKET_WINDOW_MS);
    const [txs, scrap, steel] = await Promise.all([
      listItemMarketTxSince(db, since),
      getLatestItemMarketPrice(db, "scraps"),
      getLatestItemMarketPrice(db, "steel"),
    ]);

    const compare = buildCraftCompare({
      tier,
      txs,
      scrapPrice: scrap?.price ?? null,
      steelPrice: steel?.price ?? null,
      taxRate,
    });

    return c.json({
      windowMs: MARKET_WINDOW_MS,
      scrapedAt: scrap?.fetchedAt?.toISOString() ?? null,
      steelFetchedAt: steel?.fetchedAt?.toISOString() ?? null,
      ...compare,
    });
  });

  app.get("/:itemCode", async (c) => {
    const itemCode = c.req.param("itemCode");
    const countryIdRaw = c.req.query("countryId");
    const countryId = countryIdRaw?.trim() ? countryIdRaw.trim() : null;
    const skills = parseSkillsQuery(c.req.query("skills"));

    const now = Date.now();
    const since = new Date(now - TREND_LOOKBACK_MS);
    const [txs, scrap] = await Promise.all([
      listItemMarketTxSince(db, since, itemCode),
      getLatestItemMarketPrice(db, "scraps"),
    ]);

    let taxRate: number | null = null;
    if (countryId) {
      const rows = await db
        .select({ taxRate: countries.taxRate })
        .from(countries)
        .where(eq(countries.id, countryId))
        .limit(1);
      taxRate = rows[0]?.taxRate ?? null;
    }

    const detail = buildEquipmentDetail({
      itemCode,
      txs,
      scrapPrice: scrap?.price ?? null,
      taxRate,
      countryId,
      skills,
      now,
    });
    return c.json(detail);
  });

  return app;
}
