/** Build a tRPC GET path with optional JSON `input` query param. */
export function wareraProcedurePath(procedure: string, input?: unknown): string {
  if (input === undefined) return procedure;
  return `${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

export type WareraBatchItem = {
  procedure: string;
  input?: unknown;
};

export type TrpcBatchSlotResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: unknown };

/** Build a tRPC HTTP batch GET path (`batch=1` + indexed inputs). */
export function wareraBatchPath(items: WareraBatchItem[]): string {
  if (items.length === 0) {
    throw new Error("wareraBatchPath requires at least one item");
  }
  const procedures = items.map((item) => item.procedure).join(",");
  const inputRecord: Record<string, unknown> = {};
  for (let i = 0; i < items.length; i++) {
    inputRecord[String(i)] = items[i]!.input === undefined ? null : items[i]!.input;
  }
  const input = encodeURIComponent(JSON.stringify(inputRecord));
  return `${procedures}?batch=1&input=${input}`;
}

/** Parse a tRPC batch response array into per-index ok/error slots. */
export function parseTrpcBatchResponse(json: unknown): TrpcBatchSlotResult[] {
  if (!Array.isArray(json)) {
    throw new Error("WarEra batch response is not an array");
  }
  return json.map((slot) => {
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
 * Split batch items so each chunk's `wareraBatchPath` length stays ≤ maxUrlLength.
 * A single oversized item is still emitted alone (caller/server may reject).
 */
export function chunkBatchItemsByMaxUrlLength(
  items: WareraBatchItem[],
  maxUrlLength: number,
): WareraBatchItem[][] {
  if (items.length === 0) return [];
  const chunks: WareraBatchItem[][] = [];
  let current: WareraBatchItem[] = [];

  for (const item of items) {
    const candidate = [...current, item];
    if (current.length > 0 && wareraBatchPath(candidate).length > maxUrlLength) {
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
