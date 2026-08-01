import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import { getCompanyPack, isCompanyPackFresh, upsertCompanyPack } from "./company-packs";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "company-packs-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE company_packs (
      user_id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_seconds INTEGER NOT NULL DEFAULT 600
    )
  `);
  return drizzle(client, { schema });
}

describe("company_packs", () => {
  it("isCompanyPackFresh respects TTL", () => {
    const fetchedAt = new Date("2026-08-01T12:00:00.000Z");
    expect(isCompanyPackFresh(fetchedAt, 600, new Date("2026-08-01T12:09:59.000Z"))).toBe(true);
    expect(isCompanyPackFresh(fetchedAt, 600, new Date("2026-08-01T12:10:00.000Z"))).toBe(false);
  });

  let db: Db;
  beforeEach(async () => {
    db = await createDb();
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
