import { describe, expect, it, vi } from "vite-plus/test";
import { fetchItemMarketTransactionsPage, parseItemMarketTransactionsPage } from "./transactions";

const equipmentTx = {
  _id: "6a720c0d8fe5b64f93cb3851",
  money: 37.79,
  itemCode: "chest4",
  quantity: 1,
  sellerId: "seller1",
  buyerId: "buyer1",
  transactionType: "itemMarket",
  item: {
    _id: "item1",
    type: "equipment",
    code: "chest4",
    skills: { armor: 22 },
    state: 100,
    maxState: 100,
    quantity: 1,
    lastAcquisitionAt: "2026-08-04T15:47:56.698Z",
  },
  offerCreatedAt: "2026-08-04T15:48:20.018Z",
  createdAt: "2026-08-04T15:58:05.369Z",
  updatedAt: "2026-08-04T15:58:05.369Z",
  __v: 0,
};

const weaponTx = {
  _id: "6a720bfad950f6985c6187a1",
  money: 38.599,
  itemCode: "sniper",
  quantity: 1,
  sellerId: "seller2",
  buyerId: "buyer2",
  transactionType: "itemMarket",
  item: {
    _id: "item2",
    code: "sniper",
    skills: { attack: 103, criticalChance: 16 },
    state: 100,
    maxState: 100,
    quantity: 1,
    lastAcquisitionAt: "2026-08-04T14:48:51.206Z",
  },
  offerCreatedAt: "2026-08-04T14:50:07.215Z",
  createdAt: "2026-08-04T15:57:46.814Z",
  updatedAt: "2026-08-04T15:57:46.814Z",
  __v: 0,
};

describe("parseItemMarketTransactionsPage", () => {
  it("maps equipment and weapon shapes", () => {
    const page = parseItemMarketTransactionsPage({
      items: [equipmentTx, weaponTx],
      cursor: "next-cur",
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("next-cur");
    expect(page.items[0]).toMatchObject({
      id: "6a720c0d8fe5b64f93cb3851",
      money: 37.79,
      itemCode: "chest4",
      itemType: "equipment",
      skills: { armor: 22 },
    });
    expect(page.items[1]).toMatchObject({
      id: "6a720bfad950f6985c6187a1",
      itemType: null,
      skills: { attack: 103, criticalChance: 16 },
    });
    expect(page.items[0].createdAt.toISOString()).toBe("2026-08-04T15:58:05.369Z");
  });

  it("accepts nextCursor alias", () => {
    const page = parseItemMarketTransactionsPage({ items: [], nextCursor: "n2" });
    expect(page.nextCursor).toBe("n2");
  });
});

describe("fetchItemMarketTransactionsPage", () => {
  it("calls getPaginatedTransactions on api2 with itemMarket", async () => {
    const request = vi.fn().mockResolvedValue({
      result: { data: { items: [equipmentTx], cursor: null } },
    });
    const page = await fetchItemMarketTransactionsPage({ request }, { limit: 100 });
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("transaction.getPaginatedTransactions"),
      expect.objectContaining({
        baseUrl: "https://api2.warera.io/trpc",
        authStyle: "api-key",
      }),
    );
    const called = String(request.mock.calls[0][0]);
    expect(called).toContain("itemMarket");
    expect(decodeURIComponent(called)).toContain('"limit":100');
    expect(page.items[0].id).toBe(equipmentTx._id);
  });
});
