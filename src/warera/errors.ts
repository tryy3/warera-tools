/**
 * True when a WarEra client/`request` failure looks like a missing entity
 * (HTTP 404 or tRPC NOT_FOUND), as opposed to a transport / auth error.
 */
export function isWareraNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /WarEra request failed: 404\b/.test(msg) || /\bNOT_FOUND\b/.test(msg);
}

/** True when a GET batch was rejected so a POST fallback may be appropriate. */
export function isWareraGetRejectedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /WarEra request failed: (400|404|405)\b/.test(msg) ||
    /unknown method|NOT_FOUND|Method Not Allowed/i.test(msg)
  );
}
