import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import {
  getRecommendedRegion,
  getRecommendedRegionsByItemCodes,
  upsertRecommendedRegion,
} from "./recommended-regions";

describe("recommended_regions db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
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

  it("batch loads by item codes", async () => {
    await upsertRecommendedRegion(db, {
      itemCode: "steel",
      regionId: "r1",
      regionName: null,
      bonus: 0.1,
      payload: null,
      fetchedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    await upsertRecommendedRegion(db, {
      itemCode: "iron",
      regionId: "r2",
      regionName: null,
      bonus: 0.2,
      payload: null,
      fetchedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const map = await getRecommendedRegionsByItemCodes(db, ["steel", "iron", "wood"]);
    expect(map.size).toBe(2);
    expect(map.get("steel")?.regionId).toBe("r1");
    expect(map.has("wood")).toBe(false);
  });
});
