import { afterAll, describe, expect, it } from "vite-plus/test";
import * as schema from "../schema";
import { createTestDb } from "./postgres";

describe("createTestDb", () => {
  let stop: () => Promise<void>;

  afterAll(async () => {
    if (stop) await stop();
  });

  it("migrates and accepts inserts", async () => {
    const ctx = await createTestDb();
    stop = ctx.stop;
    await ctx.db.insert(schema.jobs).values({
      id: "heartbeat",
      name: "Heartbeat",
      cron: "0 * * * * *",
    });
    const rows = await ctx.db.select().from(schema.jobs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("heartbeat");
  });
});
