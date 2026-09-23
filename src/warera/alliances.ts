import type { WareraRequester } from "./prices";
import { unwrapTrpcData, wareraProcedurePath } from "./trpc";

export type ParsedAlliance = {
  id: string;
  name: string | null;
  coreDevelopment: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
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

function pickFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseAlliance(raw: unknown): ParsedAlliance | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = pickString(obj, ["_id", "id", "allianceId"]);
  if (!id) return null;
  return {
    id,
    name: pickString(obj, ["name"]),
    coreDevelopment: pickFiniteNumber(obj.coreDevelopment),
  };
}

export function parseAlliancePage(raw: unknown): {
  items: ParsedAlliance[];
  nextCursor: string | null;
} {
  const data = unwrapTrpcData(raw);
  const obj = asRecord(data);
  const rows = Array.isArray(data) ? data : Array.isArray(obj?.items) ? obj.items : [];
  const items: ParsedAlliance[] = [];
  for (const row of rows) {
    const parsed = parseAlliance(row);
    if (parsed) items.push(parsed);
  }
  const nextCursor =
    (typeof obj?.nextCursor === "string" && obj.nextCursor) ||
    (typeof obj?.cursor === "string" && obj.cursor) ||
    null;
  return { items, nextCursor };
}

export async function fetchAllAlliances(warera: WareraRequester): Promise<ParsedAlliance[]> {
  const items: ParsedAlliance[] = [];
  let page = 1;
  for (;;) {
    const json = await warera.request<unknown>(
      wareraProcedurePath("alliance.getManyPaginated", { page, limit: 50 }),
    );
    const parsed = parseAlliancePage(json);
    items.push(...parsed.items);
    if (!parsed.nextCursor || parsed.items.length === 0) break;
    page += 1;
    if (page > 20) break;
  }
  return items;
}
