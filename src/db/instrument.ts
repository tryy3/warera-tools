import type pg from "pg";
import type { Logger } from "../logging/logger";

function truncateSql(sql: string, max = 180): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

/**
 * Wrap a pg Pool so each query is logged like warera requests
 * (`db query` with sql + durationMs).
 */
export function instrumentPgPool(pool: pg.Pool, logger: Logger): pg.Pool {
  const query = pool.query.bind(pool);
  (pool as pg.Pool).query = ((...args: unknown[]) => {
    const started = performance.now();
    const sql =
      typeof args[0] === "string"
        ? args[0]
        : String((args[0] as { text?: string } | undefined)?.text ?? "");
    const result = (query as (...a: unknown[]) => Promise<unknown>)(...args);
    return Promise.resolve(result).then(
      (rows) => {
        logger.debug(
          { sql: truncateSql(sql), durationMs: Math.round(performance.now() - started) },
          "db query",
        );
        return rows;
      },
      (err) => {
        logger.debug(
          {
            sql: truncateSql(sql),
            durationMs: Math.round(performance.now() - started),
            error: err instanceof Error ? err.message : String(err),
          },
          "db query",
        );
        throw err;
      },
    );
  }) as typeof pool.query;
  return pool;
}
