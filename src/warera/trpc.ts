/** Build a tRPC GET path with optional JSON `input` query param. */
export function wareraProcedurePath(procedure: string, input?: unknown): string {
  if (input === undefined) return procedure;
  return `${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

export function unwrapTrpcData<T = unknown>(trpcJson: unknown): T {
  const data = (trpcJson as { result?: { data?: T } })?.result?.data;
  if (data === undefined) {
    throw new Error("WarEra response missing result.data");
  }
  return data;
}
