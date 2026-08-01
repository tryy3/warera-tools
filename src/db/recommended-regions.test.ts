import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import { getRecommendedRegion, upsertRecommendedRegion } from "./recommended-regions";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "rec-regions-"));
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
  return drizzle(client, { schema });
}

describe("recommended_regions db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("upserts and reads by item code", async () => {
    await upsertRecommendedRegion(db, {
      itemCode: "steel",
      regionId: "r1",
      regionName: "Forge",
      bonus: 0.42,
      payload: { regionId: "r1" },
      fetchedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const row = await getRecommendedRegion(db, "steel");
    expect(row?.regionId).toBe("r1");
    expect(row?.bonus).toBe(0.42);
    await upsertRecommendedRegion(db, {
      itemCode: "steel",
      regionId: "r2",
      regionName: null,
      bonus: 0.5,
      payload: null,
      fetchedAt: new Date("2026-08-01T13:00:00.000Z"),
    });
    expect((await getRecommendedRegion(db, "steel"))?.regionId).toBe("r2");
  });
});
