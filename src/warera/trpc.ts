/** Build a tRPC GET path with optional JSON `input` query param. */
export function wareraProcedurePath(procedure: string, input?: unknown): string {
  if (input === undefined) return procedure;
  return `${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

export type WareraBatchItem = {
  procedure: string;
  input?: unknown;
};

export const WARERA_MAX_BATCH_SLOTS = 50;

export function chunkBatchItemsByMaxSlots(
  items: WareraBatchItem[],
  maxSlots: number,
): WareraBatchItem[][] {
  if (items.length === 0) return [];
  const chunks: WareraBatchItem[][] = [];
  for (let i = 0; i < items.length; i += maxSlots) {
    chunks.push(items.slice(i, i + maxSlots));
  }
  return chunks;
}

export type TrpcBatchSlotResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: unknown };

/** Build the indexed input record shared by GET (query) and POST (body) batches. */
export function buildBatchInputRecord(items: WareraBatchItem[]): Record<string, unknown> {
  if (items.length === 0) {
    throw new Error("buildBatchInputRecord requires at least one item");
  }
  // Always index by slot (`{"0":…}`), including 1-item batches. Unindexed
  // `{"userId":…}` / `{"muId":…}` under `?batch=1` is rejected by live api2
  // (`input` arrives undefined → 400 Required).
  const inputRecord: Record<string, unknown> = {};
  for (let i = 0; i < items.length; i++) {
    inputRecord[String(i)] = items[i]!.input === undefined ? null : items[i]!.input;
  }
  return inputRecord;
}

/** Build a tRPC HTTP batch GET path (`batch=1` + indexed inputs). */
export function wareraBatchPath(items: WareraBatchItem[]): string {
  if (items.length === 0) {
    throw new Error("wareraBatchPath requires at least one item");
  }
  const procedures = items.map((item) => item.procedure).join(",");
  const input = encodeURIComponent(JSON.stringify(buildBatchInputRecord(items)));
  return `${procedures}?batch=1&input=${input}`;
}

/** Build a tRPC HTTP batch POST path (`batch=1`, no input query — inputs go in the body). */
export function wareraBatchPostPath(items: WareraBatchItem[]): string {
  if (items.length === 0) {
    throw new Error("wareraBatchPostPath requires at least one item");
  }
  const procedures = items.map((item) => item.procedure).join(",");
  return `${procedures}?batch=1`;
}

/** Normalize tRPC batch HTTP JSON — WarEra returns a single slot object for 1-item batches. */
function normalizeTrpcBatchSlots(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json != null && typeof json === "object" && ("result" in json || "error" in json)) {
    return [json];
  }
  throw new Error("WarEra batch response is not an array");
}

/** Parse a tRPC batch response array into per-index ok/error slots. */
export function parseTrpcBatchResponse(json: unknown): TrpcBatchSlotResult[] {
  return normalizeTrpcBatchSlots(json).map((slot) => {
    if (slot != null && typeof slot === "object" && "result" in slot) {
      const data = (slot as { result?: { data?: unknown } }).result?.data;
      if (data !== undefined) {
        return { ok: true as const, data };
      }
    }
    const error =
      slot != null && typeof slot === "object" && "error" in slot
        ? (slot as { error: unknown }).error
        : slot;
    return { ok: false as const, error };
  });
}

/**
 * Split batch items so each chunk's path length stays ≤ maxUrlLength.
 * A single oversized item is still emitted alone (caller/server may reject).
 *
 * `pathBuilder` defaults to the GET batch path (includes the input query). For
 * POST batches, pass `wareraBatchPostPath` so chunking is measured against the
 * shorter procedure-only URL (inputs travel in the body).
 */
export function chunkBatchItemsByMaxUrlLength(
  items: WareraBatchItem[],
  maxUrlLength: number,
  pathBuilder: (items: WareraBatchItem[]) => string = wareraBatchPath,
): WareraBatchItem[][] {
  if (items.length === 0) return [];
  const chunks: WareraBatchItem[][] = [];
  let current: WareraBatchItem[] = [];

  for (const item of items) {
    const candidate = [...current, item];
    if (current.length > 0 && pathBuilder(candidate).length > maxUrlLength) {
      chunks.push(current);
      current = [item];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function unwrapTrpcData<T = unknown>(trpcJson: unknown): T {
  const data = (trpcJson as { result?: { data?: T } })?.result?.data;
  if (data === undefined) {
    throw new Error("WarEra response missing result.data");
  }
  return data;
}
