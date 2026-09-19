import type pg from "pg";
import type { Logger } from "../logging/logger";

function truncateSql(sql: string, max = 180): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

function extractSql(args: unknown[]): string {
  return typeof args[0] === "string"
    ? args[0]
    : String((args[0] as { text?: string } | undefined)?.text ?? "");
}

function wrapQueryFn<T extends (...args: unknown[]) => unknown>(query: T, logger: Logger): T {
  return ((...args: unknown[]) => {
    const started = performance.now();
    const sql = extractSql(args);
    const result = query(...args);
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
  }) as T;
}

const instrumentedClients = new WeakSet<object>();

function instrumentClient(client: pg.PoolClient, logger: Logger): pg.PoolClient {
  if (instrumentedClients.has(client)) return client;
  instrumentedClients.add(client);
  const query = client.query.bind(client);
  client.query = wrapQueryFn(
    query as (...args: unknown[]) => unknown,
    logger,
  ) as typeof client.query;
  return client;
}

/**
 * Wrap a pg Pool so each query is logged like warera requests
 * (`db query` with sql + durationMs).
 *
 * Covers both `pool.query` and Drizzle's `connect` → `client.query` path.
 */
export function instrumentPgPool(pool: pg.Pool, logger: Logger): pg.Pool {
  const query = pool.query.bind(pool);
  (pool as pg.Pool).query = wrapQueryFn(
    query as (...args: unknown[]) => unknown,
    logger,
  ) as typeof pool.query;

  const connect = pool.connect.bind(pool);
  (pool as pg.Pool).connect = ((...args: unknown[]) => {
    // Callback form: connect(callback)
    if (typeof args[0] === "function") {
      const cb = args[0] as (
        err: Error | undefined,
        client?: pg.PoolClient,
        done?: (release?: unknown) => void,
      ) => void;
      return connect((err, client, done) => {
        if (client) instrumentClient(client, logger);
        cb(err, client, done);
      });
    }
    // Promise form: connect()
    return (connect() as Promise<pg.PoolClient>).then((client) => instrumentClient(client, logger));
  }) as typeof pool.connect;

  return pool;
}
