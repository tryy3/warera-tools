export const CORRELATION_KEYS = ["request_id", "job_id", "job_run_id"] as const;
export type CorrelationKey = (typeof CORRELATION_KEYS)[number];

export function promoteCorrelationAttrs(
  logMeta: unknown,
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...attributes };
  if (!logMeta || typeof logMeta !== "object") return out;
  const meta = logMeta as Record<string, unknown>;
  for (const key of CORRELATION_KEYS) {
    if (out[key] !== undefined) continue;
    const value = meta[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
