import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { Decimal, moneyEquals } from "../money/decimal";
import type { Db } from "./client";
import { createTestDb, truncateAllTables } from "./test/postgres";
import { insertDonationPoll, insertDonationSnapshots } from "./donations";
import * as schema from "./schema";

describe("donations db", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
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
    expect(moneyEquals(snaps[0]?.amount, new Decimal("100"))).toBe(true);
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
