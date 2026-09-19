import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import { getRecommendedRegion } from "../../db/recommended-regions";
import { getRegion } from "../../db/regions";
import { listProducibleRecipes } from "../../economy/recipes";
import { runRecommendedRegionsPoll } from "./run";

describe("runRecommendedRegionsPoll", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("upserts each recipe item and enqueues region ids", async () => {
    const warera = {
      request: vi.fn(async (_path: string, opts?: { json?: { itemCode: string } }) => {
        const itemCode = opts?.json?.itemCode ?? "unknown";
        return {
          result: {
            data: [{ regionId: `reg-${itemCode}`, name: "R", bonus: 12 }],
          },
        };
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };
    const result = await runRecommendedRegionsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("success");
    expect(result.itemCount).toBe(listProducibleRecipes().length);
    const steel = await getRecommendedRegion(db, "steel");
    expect(steel?.regionId).toBe("reg-steel");
    expect(await getRegion(db, "reg-steel")).not.toBeNull();
  });

  it("marks partial when one item fails", async () => {
    const warera = {
      request: vi.fn(async (_path: string, opts?: { json?: { itemCode: string } }) => {
        const itemCode = opts?.json?.itemCode ?? "unknown";
        if (itemCode === "steel") throw new Error("boom");
        return {
          result: { data: [{ regionId: `reg-${itemCode}`, name: "R", bonus: 10 }] },
        };
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };
    const result = await runRecommendedRegionsPoll({
      db,
      warera: warera as never,
      logger: logger as never,
    });
    expect(result.status).toBe("partial");
    expect(result.errors).toBeGreaterThan(0);
    expect(await getRecommendedRegion(db, "iron")).not.toBeNull();
    expect(await getRecommendedRegion(db, "steel")).toBeNull();
  });
});
