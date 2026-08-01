import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { getRecommendedRegion } from "../../db/recommended-regions";
import { getRegion } from "../../db/regions";
import * as schema from "../../db/schema";
import { listProducibleRecipes } from "../../economy/recipes";
import { runRecommendedRegionsPoll } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "rec-poll-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE recommended_regions (
      item_code TEXT PRIMARY KEY NOT NULL,
      region_id TEXT NOT NULL,
      region_name TEXT,
      bonus REAL,
      payload TEXT,
      fetched_at INTEGER NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE regions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      country_code TEXT,
      payload TEXT,
      fetched_at INTEGER,
      enqueued_at INTEGER NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

describe("runRecommendedRegionsPoll", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
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
