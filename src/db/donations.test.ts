import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import { insertDonationPoll, insertDonationSnapshots } from "./donations";
import * as schema from "./schema";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "donations-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE donation_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      scope_count INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE donation_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL REFERENCES donation_polls(id),
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      donation_row_id TEXT,
      amount REAL,
      donation_created_at INTEGER,
      donation_updated_at INTEGER,
      payload TEXT
    )
  `);
  return drizzle(client, { schema });
}

describe("donations db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("inserts poll and snapshot rows", async () => {
    const pollId = await insertDonationPoll(db, {
      recordedAt: new Date("2026-09-03T12:00:00.000Z"),
      status: "success",
      scopeCount: 1,
      rowCount: 1,
    });
    await insertDonationSnapshots(db, pollId, [
      {
        scopeType: "mu",
        scopeId: "mu1",
        userId: "u1",
        donationRowId: "d1",
        amount: 100,
        donationCreatedAt: new Date("2026-04-01T00:00:00.000Z"),
        donationUpdatedAt: new Date("2026-09-01T00:00:00.000Z"),
        payload: null,
      },
    ]);
    expect(pollId).toBeGreaterThan(0);
    const polls = await db.select().from(schema.donationPolls);
    expect(polls).toHaveLength(1);
    expect(polls[0]?.status).toBe("success");
    expect(polls[0]?.scopeCount).toBe(1);
    expect(polls[0]?.rowCount).toBe(1);
    const snaps = await db
      .select()
      .from(schema.donationSnapshots)
      .where(eq(schema.donationSnapshots.pollId, pollId));
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.scopeType).toBe("mu");
    expect(snaps[0]?.scopeId).toBe("mu1");
    expect(snaps[0]?.userId).toBe("u1");
    expect(snaps[0]?.donationRowId).toBe("d1");
    expect(snaps[0]?.amount).toBe(100);
  });

  it("no-ops on empty snapshot arrays", async () => {
    const pollId = await insertDonationPoll(db, {
      recordedAt: new Date(),
      status: "success",
      scopeCount: 0,
      rowCount: 0,
    });
    await expect(insertDonationSnapshots(db, pollId, [])).resolves.toBeUndefined();
  });
});
