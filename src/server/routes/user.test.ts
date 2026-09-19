import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import { upsertCompanyPack } from "../../db/company-packs";
import { insertPricePoll, insertPriceSnapshots } from "../../db/prices";
import { listProducibleRecipes } from "../../economy/recipes";
import type { Logger } from "../../logging/logger";
import { errorPayload } from "../errors";
import { userRoutes } from "./user";

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

const liteFixture = {
  level: 12,
  availableSkillPoints: 5,
  spentSkillPoints: 15,
  totalSkillPoints: 20,
};

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

function userLiteMock() {
  return vi.fn(async (path: string) => {
    if (path.includes("user.getUserLite")) {
      return {
        result: {
          data: {
            _id: "u1",
            username: "Alice",
            leveling: liteFixture,
            skills: {
              energy: { level: 2, total: 50 },
              production: { level: 3, total: 19 },
            },
          },
        },
      };
    }
    if (path.includes("user.getUserById")) {
      return { result: { data: { _id: "u1", company: null } } };
    }
    if (path.includes("worker.getWorkers")) {
      return { result: { data: [] } };
    }
    throw new Error(`unexpected warera call: ${path}`);
  });
}

function appFor(db: Db, request: (path: string) => Promise<unknown> = userLiteMock()) {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route(
    "/",
    userRoutes({
      db,
      warera: { request } as never,
      logger: silentLogger,
    }),
  );
  return app;
}

describe("GET /api/user", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
    await seedPrices(db);
  });

  it("400s without userId", async () => {
    const res = await appFor(db).request("http://localhost/");
    expect(res.status).toBe(400);
  });

  it("returns user bootstrap shape for a fixture user", async () => {
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "c1",
          name: "Mine",
          itemCode: "iron",
          regionId: "reg-home",
          aeLevel: 3,
          productionBonus: 0.1,
          bonusDetails: null,
        },
      ],
      fetchedAt: new Date(),
    });

    const res = await appFor(db).request("http://localhost/?userId=u1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      userId: string;
      username: string;
      leveling: typeof liteFixture;
      companies: Array<Record<string, unknown>>;
      job: { status: string };
      skills: Record<string, { level: number; value: number }>;
      income: { workGPerDay: number; aeGPerDay: number };
    };
    expect(body.userId).toBe("u1");
    expect(body.username).toBe("Alice");
    expect(body.leveling).toEqual(liteFixture);
    expect(body.companies).toHaveLength(1);
    expect(body.companies[0]).toMatchObject({
      id: "c1",
      name: "Mine",
      aeLevel: 3,
      itemCode: "iron",
      productionBonus: 0.1,
    });
    expect(body.companies[0]).toHaveProperty("profitPerPp");
    expect(body.companies[0]).toHaveProperty("goldPerAePerDay");
    expect(body.skills.energy).toEqual({ level: 2, value: 50 });
    expect(body.job.status).toBe("unemployed");
    expect(body.income).toHaveProperty("workGPerDay");
    expect(body.income).toHaveProperty("aeGPerDay");
    expect(typeof body.income.workGPerDay).toBe("number");
    expect(typeof body.income.aeGPerDay).toBe("number");
  });

  it("accepts refresh=1 and refreshes company pack", async () => {
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "old",
          name: "Old",
          itemCode: "iron",
          regionId: null,
          aeLevel: 1,
          productionBonus: 0,
          bonusDetails: null,
        },
      ],
      fetchedAt: new Date(),
    });

    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserLite")) {
        return {
          result: {
            data: {
              _id: "u1",
              username: "Alice",
              leveling: liteFixture,
              skills: { energy: { level: 2, total: 50 } },
            },
          },
        };
      }
      if (path.includes("user.getUserById")) {
        return { result: { data: { _id: "u1", company: null } } };
      }
      if (path.includes("worker.getWorkers")) {
        return { result: { data: [] } };
      }
      if (String(path).includes("company.getCompanies")) {
        return { result: { data: { items: ["c-new"] } } };
      }
      if (String(path).includes("company.getById")) {
        return {
          result: {
            data: {
              _id: "c-new",
              name: "Fresh Co",
              itemCode: "iron",
              region: null,
              activeUpgradeLevels: { automatedEngine: 2 },
            },
          },
        };
      }
      if (String(path).includes("company.getProductionBonus")) {
        return { result: { data: { total: 10 } } };
      }
      throw new Error(`unexpected warera call: ${path}`);
    });

    const res = await appFor(db, request).request("http://localhost/?userId=u1&refresh=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      companiesRefreshed: boolean;
      companies: Array<{ id?: string }>;
    };
    expect(body.companiesRefreshed).toBe(true);
    expect(body.companies[0]?.id).toBe("c-new");
  });

  it("soft-fails wage lookup while still returning skills and companies", async () => {
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "c1",
          name: "Mine",
          itemCode: "iron",
          regionId: "reg-home",
          aeLevel: 3,
          productionBonus: 0.1,
          bonusDetails: null,
        },
      ],
      fetchedAt: new Date(),
    });

    const request = vi.fn(async (path: string) => {
      if (path.includes("user.getUserLite")) {
        return {
          result: {
            data: {
              _id: "u1",
              username: "Alice",
              leveling: liteFixture,
              skills: {
                energy: { level: 2, total: 50 },
                production: { level: 3, total: 19 },
              },
            },
          },
        };
      }
      if (path.includes("user.getUserById")) {
        return { result: { data: { _id: "u1", company: "job-co" } } };
      }
      if (path.includes("worker.getWorkers")) {
        throw new Error("wage lookup failed");
      }
      throw new Error(`unexpected warera call: ${path}`);
    });

    const res = await appFor(db, request).request("http://localhost/?userId=u1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      skills: Record<string, { level: number; value: number }>;
      companies: Array<{ id?: string }>;
      job: { status: string };
      income: { workGPerDay: number };
    };
    expect(body.skills.energy).toEqual({ level: 2, value: 50 });
    expect(body.companies).toHaveLength(1);
    expect(body.companies[0]?.id).toBe("c1");
    expect(body.job.status).toBe("lookupFailed");
    expect(body.income.workGPerDay).toBe(0);
  });
});
