import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import * as schema from "../../db/schema";
import { runAllianceSync } from "./run";

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

describe("runAllianceSync", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
  });

  it("upserts alliance coreDevelopment from getManyPaginated", async () => {
    const now = new Date("2026-09-20T20:00:00.000Z");
    const warera = {
      request: vi.fn(async () => ({
        result: {
          data: {
            items: [
              {
                _id: "forge",
                name: "FORGE",
                coreDevelopment: 1354.29,
                currentDevelopment: 2013.99,
              },
            ],
          },
        },
      })),
    };

    const result = await runAllianceSync({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
      now,
    });
    expect(result.count).toBe(1);

    const rows = await db.select().from(schema.alliances);
    expect(rows).toEqual([
      { id: "forge", name: "FORGE", coreDevelopment: 1354.29, fetchedAt: now },
    ]);
  });
});
