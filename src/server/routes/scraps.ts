import { Hono } from "hono";
import { getCached, getCachedRow, setCached } from "../../db/cache";
import type { Db } from "../../db/client";
import { fetchScrapsPrice } from "../../warera/prices";
import { HttpError } from "../errors";

export const SCRAPS_CACHE_KEY = "warera:scraps:price";
export const SCRAPS_CACHE_TTL_SECONDS = 86400;

export type ScrapPricePayload = { price: number; fetchedAt: string };
export type ScrapPriceResponse = ScrapPricePayload & { stale?: boolean };

export type ScrapsRouteDeps = {
  db: Db;
  warera: { request: <T>(path: string, init?: RequestInit) => Promise<T> };
};

export async function resolveScrapPrice(
  db: Db,
  warera: { request: <T>(path: string, init?: RequestInit) => Promise<T> },
  options: { force: boolean },
): Promise<ScrapPriceResponse> {
  if (!options.force) {
    const fresh = await getCached<ScrapPricePayload>(db, SCRAPS_CACHE_KEY);
    if (fresh) return fresh;
  }

  try {
    const price = await fetchScrapsPrice(warera);
    const payload: ScrapPricePayload = { price, fetchedAt: new Date().toISOString() };
    await setCached(db, SCRAPS_CACHE_KEY, payload, SCRAPS_CACHE_TTL_SECONDS, "scraps");
    return payload;
  } catch (err) {
    const row = await getCachedRow<ScrapPricePayload>(db, SCRAPS_CACHE_KEY);
    if (row) {
      return { ...row.payload, stale: true };
    }
    throw new HttpError(
      502,
      "upstream_error",
      err instanceof Error ? err.message : "Failed to fetch scrap price",
    );
  }
}

export async function getScrapPrice(
  db: Db,
  warera: { request: <T>(path: string, init?: RequestInit) => Promise<T> },
  opts?: { force?: boolean },
): Promise<ScrapPriceResponse> {
  return resolveScrapPrice(db, warera, { force: opts?.force ?? false });
}

export function scrapsRoutes(deps: ScrapsRouteDeps) {
  const { db, warera } = deps;
  const app = new Hono();

  app.get("/", async (c) => {
    const result = await resolveScrapPrice(db, warera, { force: false });
    return c.json(result);
  });

  app.post("/refresh", async (c) => {
    const result = await resolveScrapPrice(db, warera, { force: true });
    return c.json(result);
  });

  return app;
}
