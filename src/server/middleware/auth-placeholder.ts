import type { MiddlewareHandler } from "hono";

/**
 * BetterAuth insertion point — replace this no-op with real session checks later.
 */
export const authPlaceholder: MiddlewareHandler = async (_c, next) => {
  await next();
};
