import { describe, expect, it, vi } from "vite-plus/test";
import { fetchCurrentEquipment, parseInventoryEquipment } from "./inventory";

describe("parseInventoryEquipment", () => {
  it("parses a root equipment array", () => {
    expect(
      parseInventoryEquipment([
        {
          itemCode: "sniper",
          skills: { attack: 103, criticalChance: 16, label: "ignored" },
          slot: "weapon",
        },
        {
          item: { code: "helmet4", skills: { armor: 22 } },
        },
      ]),
    ).toEqual([
      {
        itemCode: "sniper",
        skills: { attack: 103, criticalChance: 16 },
        slotHint: "weapon",
      },
      {
        itemCode: "helmet4",
        skills: { armor: 22 },
        slotHint: "helmet",
      },
    ]);
  });

  it("parses nested slot object maps and skips junk entries", () => {
    expect(
      parseInventoryEquipment({
        slots: {
          primary: { code: "rifle", type: "weapon", skills: { attack: 50 } },
          body: { itemCode: "chest3", skills: { armor: 12 } },
          missingCode: { skills: { armor: 99 } },
          scalar: "junk",
        },
      }),
    ).toEqual([
      {
        itemCode: "rifle",
        skills: { attack: 50 },
        slotHint: "weapon",
      },
      {
        itemCode: "chest3",
        skills: { armor: 12 },
        slotHint: "chest",
      },
    ]);
  });

  it("returns an empty array for unknown payloads", () => {
    expect(parseInventoryEquipment({ unexpected: { value: true } })).toEqual([]);
    expect(parseInventoryEquipment(null)).toEqual([]);
  });
});

describe("fetchCurrentEquipment", () => {
  it("requests inventory.fetchCurrentEquipment and unwraps tRPC data", async () => {
    const payload = { equipment: [] };
    const request = vi.fn().mockResolvedValue({ result: { data: payload } });

    await expect(fetchCurrentEquipment({ request }, "user-1")).resolves.toBe(payload);

    expect(request).toHaveBeenCalledOnce();
    const path = String(request.mock.calls[0]![0]);
    expect(path).toContain("inventory.fetchCurrentEquipment");
    expect(decodeURIComponent(path)).toContain('"userId":"user-1"');
  });
});
