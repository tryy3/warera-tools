import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import {
  enqueueRegion,
  getRegion,
  getRegionsByIds,
  enqueueRegions,
  listRegionsForSync,
  upsertRegionFetched,
} from "./regions";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "regions-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
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

describe("regions db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("enqueues once and is idempotent", async () => {
    const t = new Date("2026-08-01T12:00:00.000Z");
    expect(await enqueueRegion(db, "r1", t)).toBe(true);
    expect(await enqueueRegion(db, "r1", t)).toBe(false);
    const row = await getRegion(db, "r1");
    expect(row?.fetchedAt).toBeNull();
    expect(row?.enqueuedAt.toISOString()).toBe(t.toISOString());
  });

  it("upserts fetched data without clearing on re-enqueue", async () => {
    await enqueueRegion(db, "r1", new Date("2026-08-01T12:00:00.000Z"));
    await upsertRegionFetched(db, {
      id: "r1",
      name: "Alpha",
      countryCode: "SE",
      fetchedAt: new Date("2026-08-01T12:05:00.000Z"),
    });
    await enqueueRegion(db, "r1");
    const row = await getRegion(db, "r1");
    expect(row?.name).toBe("Alpha");
    expect(row?.countryCode).toBe("SE");
    expect(row?.fetchedAt).not.toBeNull();
  });

  it("lists null fetched_at before older fetched rows", async () => {
    await upsertRegionFetched(db, {
      id: "old",
      name: "Old",
      countryCode: "NO",
      fetchedAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    await enqueueRegion(db, "pending", new Date("2026-08-01T11:00:00.000Z"));
    await upsertRegionFetched(db, {
      id: "newer",
      name: "New",
      countryCode: "FI",
      fetchedAt: new Date("2026-08-01T11:30:00.000Z"),
    });
    const ids = (await listRegionsForSync(db)).map((r) => r.id);
    expect(ids[0]).toBe("pending");
    expect(ids.slice(1)).toEqual(["old", "newer"]);
  });

  it("batch loads and enqueues regions", async () => {
    await upsertRegionFetched(db, {
      id: "a",
      name: "A",
      countryCode: "SE",
      fetchedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const map = await getRegionsByIds(db, ["a", "missing"]);
    expect(map.get("a")?.name).toBe("A");
    expect(map.has("missing")).toBe(false);
    expect(await enqueueRegions(db, ["a", "b", "b"])).toBe(1);
    expect(await enqueueRegions(db, ["a", "b"])).toBe(0);
    expect((await getRegionsByIds(db, ["b"])).get("b")?.fetchedAt).toBeNull();
  });
});
