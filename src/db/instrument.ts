import type { Client, InStatement, ResultSet } from "@libsql/client";
import type { Logger } from "../logging/logger";

function sqlText(stmt: InStatement | string): string {
  if (typeof stmt === "string") return stmt;
  return stmt.sql;
}

function truncateSql(sql: string, max = 180): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

/**
 * Wrap a libsql client so each execute/batch is logged like warera requests
 * (`db query` with sql + durationMs).
 */
export function instrumentLibsqlClient(client: Client, logger: Logger): Client {
  const execute = client.execute.bind(client);
  const batch = client.batch.bind(client);

  client.execute = async (stmt: InStatement | string): Promise<ResultSet> => {
    const started = performance.now();
    try {
      const result = await execute(stmt);
      logger.info(
        {
          sql: truncateSql(sqlText(stmt)),
          durationMs: Math.round(performance.now() - started),
        },
        "db query",
      );
      return result;
    } catch (err) {
      logger.info(
        {
          sql: truncateSql(sqlText(stmt)),
          durationMs: Math.round(performance.now() - started),
          error: err instanceof Error ? err.message : String(err),
        },
        "db query",
      );
      throw err;
    }
  };

  client.batch = async (
    stmts: InStatement[],
    mode?: Parameters<Client["batch"]>[1],
  ): Promise<ResultSet[]> => {
    const started = performance.now();
    try {
      const result = await batch(stmts, mode);
      logger.info(
        {
          sql: `batch(${stmts.length})`,
          durationMs: Math.round(performance.now() - started),
        },
        "db query",
      );
      return result;
    } catch (err) {
      logger.info(
        {
          sql: `batch(${stmts.length})`,
          durationMs: Math.round(performance.now() - started),
          error: err instanceof Error ? err.message : String(err),
        },
        "db query",
      );
      throw err;
    }
  };

  return client;
}
