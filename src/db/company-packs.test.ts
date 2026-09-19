import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import { getCompanyPack, isCompanyPackFresh, upsertCompanyPack } from "./company-packs";

describe("company_packs", () => {
  it("isCompanyPackFresh respects TTL", () => {
    const fetchedAt = new Date("2026-08-01T12:00:00.000Z");
    expect(isCompanyPackFresh(fetchedAt, 600, new Date("2026-08-01T12:09:59.000Z"))).toBe(true);
    expect(isCompanyPackFresh(fetchedAt, 600, new Date("2026-08-01T12:10:00.000Z"))).toBe(false);
  });

  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("upserts and reads pack payload", async () => {
    const fetchedAt = new Date("2026-08-01T12:00:00.000Z");
    await upsertCompanyPack(db, {
      userId: "u1",
      companies: [
        {
          id: "c1",
          name: "Mine",
          itemCode: "iron",
          regionId: "r1",
          aeLevel: 3,
          productionBonus: 0.2,
          bonusDetails: null,
        },
      ],
      fetchedAt,
    });
    const pack = await getCompanyPack(db, "u1");
    expect(pack?.companies[0]?.id).toBe("c1");
    expect(pack?.ttlSeconds).toBe(600);
    expect(pack?.fetchedAt.toISOString()).toBe(fetchedAt.toISOString());
  });
});
