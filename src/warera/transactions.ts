import type { WareraRequestInit } from "./client";
import { API2_TRPC_BASE } from "./client";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type ItemMarketTransaction = {
  id: string;
  money: number;
  itemCode: string;
  quantity: number;
  sellerId: string;
  buyerId: string;
  transactionType: string;
  itemId: string;
  itemType: string | null;
  itemState: number | null;
  itemMaxState: number | null;
  itemQuantity: number | null;
  itemLastAcquisitionAt: Date | null;
  skills: Record<string, unknown> | null;
  offerCreatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  payload: Record<string, unknown> | null;
};

export type ItemMarketTransactionsPage = {
  items: ItemMarketTransaction[];
  nextCursor: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function pickDate(obj: Record<string, unknown>, keys: string[]): Date | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function parseOne(raw: unknown): ItemMarketTransaction | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, ["_id", "id"]);
  const money = pickNumber(obj, ["money"]);
  const itemCode = pickString(obj, ["itemCode", "item_code"]);
  const quantity = pickNumber(obj, ["quantity"]);
  const sellerId = pickString(obj, ["sellerId", "seller_id"]);
  const buyerId = pickString(obj, ["buyerId", "buyer_id"]);
  const transactionType = pickString(obj, ["transactionType", "transaction_type"]);
  const createdAt = pickDate(obj, ["createdAt", "created_at"]);
  const item = asRecord(obj.item);
  const itemId = item ? pickString(item, ["_id", "id"]) : null;
  if (
    !id ||
    money == null ||
    !itemCode ||
    quantity == null ||
    !sellerId ||
    !buyerId ||
    !transactionType ||
    !createdAt ||
    !itemId
  ) {
    return null;
  }

  const knownTop = new Set([
    "_id",
    "id",
    "money",
    "itemCode",
    "quantity",
    "sellerId",
    "buyerId",
    "transactionType",
    "item",
    "offerCreatedAt",
    "createdAt",
    "updatedAt",
    "__v",
  ]);
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!knownTop.has(k)) payload[k] = v;
  }

  const skillsRaw = item?.skills;
  const skills = asRecord(skillsRaw);

  return {
    id,
    money,
    itemCode,
    quantity,
    sellerId,
    buyerId,
    transactionType,
    itemId,
    itemType: item ? pickString(item, ["type"]) : null,
    itemState: item ? pickNumber(item, ["state"]) : null,
    itemMaxState: item ? pickNumber(item, ["maxState", "max_state"]) : null,
    itemQuantity: item ? pickNumber(item, ["quantity"]) : null,
    itemLastAcquisitionAt: item
      ? pickDate(item, ["lastAcquisitionAt", "last_acquisition_at"])
      : null,
    skills,
    offerCreatedAt: pickDate(obj, ["offerCreatedAt", "offer_created_at"]),
    createdAt,
    updatedAt: pickDate(obj, ["updatedAt", "updated_at"]),
    payload: Object.keys(payload).length > 0 ? payload : null,
  };
}

export function parseItemMarketTransactionsPage(data: unknown): ItemMarketTransactionsPage {
  const obj = asRecord(data);
  const list = obj && Array.isArray(obj.items) ? obj.items : Array.isArray(data) ? data : [];
  const items = list.flatMap((row) => {
    const parsed = parseOne(row);
    return parsed ? [parsed] : [];
  });
  const nextCursor =
    (obj && typeof obj.nextCursor === "string" && obj.nextCursor) ||
    (obj && typeof obj.cursor === "string" && obj.cursor) ||
    null;
  return { items, nextCursor };
}

/**
 * Force official api2 with X-API-Key: gateway (warerastats) has had DB failures
 * on this procedure. Official input uses `limit` (max 100), not `perPage`:
 * https://api2.warera.io/docs/#/transaction/transaction.getPaginatedTransactions
 */
export async function fetchItemMarketTransactionsPage(
  warera: WareraRequester,
  opts: { cursor?: string; limit?: number } = {},
  init?: WareraRequestInit,
): Promise<ItemMarketTransactionsPage> {
  const input: Record<string, unknown> = {
    transactionType: "itemMarket",
    limit: opts.limit ?? 100,
  };
  if (opts.cursor) input.cursor = opts.cursor;
  const path = wareraProcedurePath("transaction.getPaginatedTransactions", input);
  const requestInit: WareraRequestInit = {
    ...init,
    baseUrl: API2_TRPC_BASE,
    authStyle: "api-key",
  };
  const json = await warera.request<unknown>(path, requestInit);
  return parseItemMarketTransactionsPage(unwrapTrpcData(json));
}
