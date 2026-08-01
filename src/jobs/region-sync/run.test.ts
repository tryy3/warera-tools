import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { enqueueRegion, getRegion } from "../../db/regions";
import * as schema from "../../db/schema";
import { runRegionSync } from "./run";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "region-sync-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE regions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      country_code TEXT,
      payload TEXT,
      fetched_at INTEGER,
      enqueued_at INTEGER NOT NULL
    );
  `);
  return drizzle(client, { schema });
}

describe("runRegionSync", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("no-ops successfully on empty watchlist", async () => {
    const request = vi.fn();
    const result = await runRegionSync({
      db,
      warera: { request } as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never,
    });
    expect(result).toEqual({ regionCount: 0, status: "success", errors: 0 });
    expect(request).not.toHaveBeenCalled();
  });

  it("fetches pending regions and upserts name/country", async () => {
    await enqueueRegion(db, "r1", new Date("2026-08-01T12:00:00.000Z"));
    const warera = {
      request: vi.fn(async () => ({
        result: { data: { name: "City", countryCode: "SE" } },
      })),
    };
    const result = await runRegionSync({
      db,
      warera: warera as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never,
    });
    expect(result.status).toBe("success");
    expect(result.regionCount).toBe(1);
    const row = await getRegion(db, "r1");
    expect(row?.name).toBe("City");
    expect(row?.countryCode).toBe("SE");
    expect(row?.fetchedAt).not.toBeNull();
  });

  it("keeps prior data when one refresh throws", async () => {
    await enqueueRegion(db, "ok", new Date("2026-08-01T12:00:00.000Z"));
    await enqueueRegion(db, "bad", new Date("2026-08-01T12:00:00.000Z"));
    const warera = {
      request: vi.fn(async (path: string) => {
        if (String(path).includes("bad")) throw new Error("upstream");
        return { result: { data: { name: "OkCity", countryCode: "NO" } } };
      }),
    };
    const result = await runRegionSync({
      db,
      warera: warera as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never,
    });
    expect(result.status).toBe("partial");
    expect((await getRegion(db, "ok"))?.name).toBe("OkCity");
    expect((await getRegion(db, "bad"))?.fetchedAt).toBeNull();
  });
});
