import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import { insertPricePoll, insertPriceSnapshots } from "../../db/prices";
import { listProducibleRecipes } from "../../economy/recipes";
import type { Logger } from "../../logging/logger";
import { errorPayload } from "../errors";
import { growthRoutes } from "./growth";

const silentLogger = {
  silly: () => {},
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as Logger;

async function seedPrices(db: Db): Promise<void> {
  const pollId = await insertPricePoll(db, {
    recordedAt: new Date("2026-08-01T12:00:00.000Z"),
    status: "success",
    itemCount: 3,
  });
  await insertPriceSnapshots(db, pollId, [
    {
      itemCode: "iron",
      marketPrice: 1,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
    {
      itemCode: "steel",
      marketPrice: 20,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
    {
      itemCode: "concrete",
      marketPrice: 5,
      buyMin: null,
      buyMax: null,
      buyAvg: null,
      sellMin: null,
      sellMax: null,
      sellAvg: null,
    },
    ...listProducibleRecipes()
      .filter((r) => !["iron", "steel", "concrete"].includes(r.itemCode))
      .map((r) => ({
        itemCode: r.itemCode,
        marketPrice: 2,
        buyMin: null,
        buyMax: null,
        buyAvg: null,
        sellMin: null,
        sellMax: null,
        sellAvg: null,
      })),
  ]);
}

function appFor(db: Db) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    growthRoutes({
      db,
      warera: {
        request: async () => {
          throw new Error("unused");
        },
      },
      logger: silentLogger,
    }),
  );
  return app;
}

describe("GET /bootstrap", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
    await seedPrices(db);
  });

  it("400s without userId", async () => {
    const res = await appFor(db).request("http://localhost/bootstrap");
    expect(res.status).toBe(400);
  });

  it("returns thin bootstrap shape without companies", async () => {
    const res = await appFor(db).request("http://localhost/bootstrap?userId=u1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      startBalance: number;
      steel: number;
      concrete: number;
      opportunitiesLite: unknown[];
      bestItem: Record<string, unknown>;
      prices: { steel: string; concrete: string };
    };
    expect(body.startBalance).toBe(0);
    expect(body.steel).toBe(0);
    expect(body.concrete).toBe(0);
    expect(body).not.toHaveProperty("companies");
    expect(body).not.toHaveProperty("companiesFetchedAt");
    expect(body).not.toHaveProperty("companiesRefreshed");
    expect(body.opportunitiesLite.length).toBeGreaterThan(0);
    expect(body.bestItem).toHaveProperty("itemCode");
    expect(body.bestItem.suggestedBonus).toBe(0);
    expect(body.prices.steel).toBe("20");
    expect(body.prices.concrete).toBe("5");
    expect(body).not.toHaveProperty("opportunities");
  });

  it("accepts refresh=1 without loading company pack", async () => {
    const request = vi.fn(async () => {
      throw new Error("warera should not be called for company pack");
    });

    const app = new Hono();
    app.onError((err, c) => {
      const { status, body } = errorPayload(err);
      return c.json(body, status as ContentfulStatusCode);
    });
    app.route(
      "/",
      growthRoutes({
        db,
        warera: { request } as never,
        logger: silentLogger,
      }),
    );

    const res = await app.request("http://localhost/bootstrap?userId=u1&refresh=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("companies");
    expect(body).not.toHaveProperty("companiesRefreshed");
    expect(request).not.toHaveBeenCalled();
  });
});
