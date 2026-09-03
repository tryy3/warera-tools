import { isWareraGetRejectedError } from "./errors";
import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type DonationScopeType = "mu" | "country" | "party";

export type ParsedDonation = {
  donationRowId: string | null;
  scopeType: DonationScopeType;
  scopeId: string;
  userId: string;
  amount: number | null;
  donationCreatedAt: Date | null;
  donationUpdatedAt: Date | null;
  payload: Record<string, unknown> | null;
};

const DONATION_INIT = { authStyle: "api-key" as const };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function pickDate(obj: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

function resolveScope(obj: Record<string, unknown>): {
  scopeType: DonationScopeType;
  scopeId: string;
} | null {
  const muId = typeof obj.muId === "string" && obj.muId ? obj.muId : null;
  const countryId =
    typeof obj.countryId === "string" && obj.countryId ? obj.countryId : null;
  const partyId = typeof obj.partyId === "string" && obj.partyId ? obj.partyId : null;
  if (muId) return { scopeType: "mu", scopeId: muId };
  if (countryId) return { scopeType: "country", scopeId: countryId };
  if (partyId) return { scopeType: "party", scopeId: partyId };
  return null;
}

const KNOWN_DONATION_KEYS = new Set([
  "_id",
  "id",
  "muId",
  "countryId",
  "partyId",
  "userId",
  "user",
  "amount",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "__v",
]);

function parseOne(raw: unknown): ParsedDonation | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const scope = resolveScope(obj);
  const userId = pickString(obj, ["userId", "user"]);
  if (!scope || scope.scopeType === "party" || !userId) return null;

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_DONATION_KEYS.has(key)) payload[key] = value;
  }

  return {
    donationRowId: pickString(obj, ["_id", "id"]),
    ...scope,
    userId,
    amount: pickNumber(obj, ["amount"]),
    donationCreatedAt: pickDate(obj, ["createdAt", "created_at"]),
    donationUpdatedAt: pickDate(obj, ["updatedAt", "updated_at"]),
    payload: Object.keys(payload).length > 0 ? payload : null,
  };
}

export function parseDonationPage(data: unknown): {
  items: ParsedDonation[];
  nextCursor: string | null;
} {
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

export async function fetchDonationPage(
  warera: WareraRequester,
  opts: {
    scopeType: "mu" | "country";
    scopeId: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{ items: ParsedDonation[]; nextCursor: string | null }> {
  const input: Record<string, unknown> = {
    limit: opts.limit ?? 100,
    ...(opts.scopeType === "mu" ? { muId: opts.scopeId } : { countryId: opts.scopeId }),
  };
  if (opts.cursor) input.cursor = opts.cursor;

  try {
    const json = await warera.request<unknown>(
      wareraProcedurePath("donation.getManyPaginated", input),
      { ...DONATION_INIT, method: "GET" },
    );
    return parseDonationPage(unwrapTrpcData(json));
  } catch (err) {
    if (!isWareraGetRejectedError(err)) throw err;
    const json = await warera.request<unknown>("donation.getManyPaginated", {
      method: "POST",
      json: input,
      ...DONATION_INIT,
    });
    return parseDonationPage(unwrapTrpcData(json));
  }
}

export async function drainDonations(
  warera: WareraRequester,
  opts: { scopeType: "mu" | "country"; scopeId: string; limit?: number },
): Promise<ParsedDonation[]> {
  const out: ParsedDonation[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchDonationPage(warera, { ...opts, cursor });
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}
