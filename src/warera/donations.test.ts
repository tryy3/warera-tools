import { describe, expect, it, vi } from "vite-plus/test";
import { drainDonations, fetchDonationPage, parseDonationPage } from "./donations";

describe("parseDonationPage", () => {
  it("maps muId/countryId to scope and keeps running totals", () => {
    const page = parseDonationPage({
      items: [
        {
          _id: "d1",
          muId: "mu1",
          countryId: null,
          partyId: null,
          userId: "u1",
          amount: 3080,
          createdAt: "2026-04-20T08:27:34.084Z",
          updatedAt: "2026-09-03T06:57:17.251Z",
        },
        {
          _id: "d2",
          muId: null,
          countryId: "c1",
          partyId: null,
          userId: "u2",
          amount: 10,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
        {
          _id: "d3",
          muId: null,
          countryId: null,
          partyId: "p1",
          userId: "u3",
          amount: 1,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      nextCursor: "cursor-2",
    });
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      donationRowId: "d1",
      scopeType: "mu",
      scopeId: "mu1",
      userId: "u1",
      amount: 3080,
    });
    expect(page.items[1]).toMatchObject({
      scopeType: "country",
      scopeId: "c1",
      userId: "u2",
      amount: 10,
    });
  });
});

describe("drainDonations", () => {
  it("follows nextCursor until exhausted", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          data: {
            items: [
              {
                _id: "d1",
                muId: "mu1",
                userId: "u1",
                amount: 1,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            nextCursor: "c2",
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: {
            items: [
              {
                _id: "d2",
                muId: "mu1",
                userId: "u2",
                amount: 2,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            nextCursor: null,
          },
        },
      });
    const rows = await drainDonations({ request } as never, {
      scopeType: "mu",
      scopeId: "mu1",
      limit: 100,
    });
    expect(rows.map((r) => r.userId)).toEqual(["u1", "u2"]);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("fetchDonationPage", () => {
  it("falls back to POST with an API key when GET is rejected", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("WarEra request failed: 400 unknown method: donation.getManyPaginated"),
      )
      .mockResolvedValueOnce({
        result: {
          data: {
            items: [
              {
                _id: "d1",
                muId: "mu1",
                userId: "u1",
                amount: 1,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            nextCursor: null,
          },
        },
      });

    const page = await fetchDonationPage({ request } as never, {
      scopeType: "mu",
      scopeId: "mu1",
    });

    expect(page.items).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: "GET", authStyle: "api-key" }),
    );
    expect(request.mock.calls[1]).toEqual([
      "donation.getManyPaginated",
      expect.objectContaining({
        method: "POST",
        json: { limit: 100, muId: "mu1" },
        authStyle: "api-key",
      }),
    ]);
  });
});
