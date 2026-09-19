import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Db } from "../../db/client";
import { createTestDb, truncateAllTables } from "../../db/test/postgres";
import * as schema from "../../db/schema";
import {
  MANUAL_SOURCE_ID,
  SEED_COUNTRY_SWEDEN_ID,
  WATCH_REASON_MANUAL,
  insertMuWatchReason,
} from "../../db/watch-reasons";
import { Decimal, moneyEquals } from "../../money/decimal";
import { donationFingerprintCache, runDonationPoll } from "./run";

const MU_ID = "mu-1";
const REASON_AT = new Date("2026-09-03T12:00:00.000Z");

async function seedMuReason(db: Db): Promise<void> {
  await insertMuWatchReason(db, {
    muId: MU_ID,
    reason: WATCH_REASON_MANUAL,
    sourceId: MANUAL_SOURCE_ID,
    at: REASON_AT,
  });
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
}

function donation(scope: "mu" | "country", amount?: number) {
  return {
    _id: `${scope}-donation`,
    ...(scope === "mu" ? { muId: MU_ID } : { countryId: SEED_COUNTRY_SWEDEN_ID }),
    userId: `${scope}-user`,
    amount: amount ?? (scope === "mu" ? 100 : 200),
    createdAt: "2026-04-20T08:27:34.084Z",
    updatedAt: "2026-09-03T06:57:17.251Z",
  };
}

function makeScopeDonationWarera(overrides?: { muAmount?: number; countryAmount?: number }) {
  return {
    request: vi.fn().mockImplementation((path: unknown) => {
      const decoded = decodeURIComponent(String(path));
      const items =
        decoded.includes(`"muId":"${MU_ID}"`) || decoded.includes(`muId":"${MU_ID}`)
          ? [donation("mu", overrides?.muAmount)]
          : [donation("country", overrides?.countryAmount)];
      return Promise.resolve({
        result: { data: { items, nextCursor: null } },
      });
    }),
  };
}

describe("runDonationPoll", () => {
  let db: Db;

  beforeAll(async () => {
    ({ db } = await createTestDb());
  });

  beforeEach(async () => {
    await truncateAllTables(db);
    donationFingerprintCache.clear();
  });

  it("ensures Sweden and writes snapshots for MU and country scopes", async () => {
    await seedMuReason(db);
    const warera = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          result: { data: { items: [donation("mu")], nextCursor: null } },
        })
        .mockResolvedValueOnce({
          result: { data: { items: [donation("country")], nextCursor: null } },
        }),
    };

    const result = await runDonationPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
    });

    expect(result).toMatchObject({ status: "success", scopeCount: 2, rowCount: 2 });
    expect(warera.request).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(warera.request.mock.calls[0]?.[0]))).toContain(
      `"muId":"${MU_ID}"`,
    );
    expect(decodeURIComponent(String(warera.request.mock.calls[1]?.[0]))).toContain(
      `"countryId":"${SEED_COUNTRY_SWEDEN_ID}"`,
    );
    const countryReasons = await db.select().from(schema.countryWatchReasons);
    expect(countryReasons).toHaveLength(1);
    expect(countryReasons[0]?.countryId).toBe(SEED_COUNTRY_SWEDEN_ID);
    const polls = await db.select().from(schema.donationPolls);
    expect(polls).toHaveLength(1);
    expect(polls[0]).toMatchObject({ status: "success", scopeCount: 2, rowCount: 2 });
    const snapshots = await db.select().from(schema.donationSnapshots);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map(({ scopeType, scopeId }) => ({ scopeType, scopeId }))).toEqual([
      { scopeType: "mu", scopeId: MU_ID },
      { scopeType: "country", scopeId: SEED_COUNTRY_SWEDEN_ID },
    ]);
  });

  it("marks partial and writes the successful scope when another scope fails", async () => {
    await seedMuReason(db);
    const warera = {
      request: vi
        .fn()
        .mockRejectedValueOnce(new Error("MU donations unavailable"))
        .mockResolvedValueOnce({
          result: { data: { items: [donation("country")], nextCursor: null } },
        }),
    };

    const result = await runDonationPoll({
      db,
      warera: warera as never,
      logger: makeLogger() as never,
    });

    expect(result).toMatchObject({ status: "partial", scopeCount: 1, rowCount: 1 });
    const polls = await db.select().from(schema.donationPolls);
    expect(polls[0]?.status).toBe("partial");
    expect(polls[0]?.error).toContain(`mu:${MU_ID}: MU donations unavailable`);
    const snapshots = await db.select().from(schema.donationSnapshots);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      scopeType: "country",
      scopeId: SEED_COUNTRY_SWEDEN_ID,
    });
  });

  it("second identical poll writes poll row but zero new snapshots", async () => {
    await seedMuReason(db);
    const warera = makeScopeDonationWarera();

    await runDonationPoll({ db, warera: warera as never, logger: makeLogger() as never });
    const afterFirst = (await db.select().from(schema.donationSnapshots)).length;

    await runDonationPoll({ db, warera: warera as never, logger: makeLogger() as never });
    const polls = await db.select().from(schema.donationPolls);
    const snapshots = await db.select().from(schema.donationSnapshots);
    expect(polls.length).toBe(2);
    expect(snapshots.length).toBe(afterFirst);
    expect(polls[1]?.rowCount).toBe(0);
  });

  it("writes a snapshot when amount changes", async () => {
    await seedMuReason(db);
    const wareraFirst = makeScopeDonationWarera();
    await runDonationPoll({
      db,
      warera: wareraFirst as never,
      logger: makeLogger() as never,
    });

    const wareraSecond = makeScopeDonationWarera({ muAmount: 150 });
    await runDonationPoll({
      db,
      warera: wareraSecond as never,
      logger: makeLogger() as never,
    });

    const polls = await db.select().from(schema.donationPolls);
    const snapshots = await db.select().from(schema.donationSnapshots);
    expect(polls.length).toBe(2);
    expect(polls[1]?.rowCount).toBe(1);
    expect(snapshots.length).toBe(3);
    const muSnapshots = snapshots.filter(
      (s) => s.scopeType === "mu" && s.scopeId === MU_ID && s.userId === "mu-user",
    );
    expect(moneyEquals(muSnapshots[0]?.amount, new Decimal("100"))).toBe(true);
    expect(moneyEquals(muSnapshots[1]?.amount, new Decimal("150"))).toBe(true);
  });

  it("warms from DB and skips rewrite after cache clear", async () => {
    await seedMuReason(db);
    const warera = makeScopeDonationWarera();

    await runDonationPoll({ db, warera: warera as never, logger: makeLogger() as never });
    const afterFirst = (await db.select().from(schema.donationSnapshots)).length;
    donationFingerprintCache.clear();

    await runDonationPoll({ db, warera: warera as never, logger: makeLogger() as never });
    const polls = await db.select().from(schema.donationPolls);
    const snapshots = await db.select().from(schema.donationSnapshots);
    expect(polls.length).toBe(2);
    expect(snapshots.length).toBe(afterFirst);
    expect(polls[1]?.rowCount).toBe(0);
  });
});
