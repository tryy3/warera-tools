/**
 * Vitest globalSetup: one Postgres Testcontainers instance for the whole run.
 * URL is written for workers (isolate resets module singletons per file).
 */
import { writeFileSync } from "node:fs";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

export const TEST_PG_URL_FILE = "/tmp/warera-vitest-pg-url";

let container: StartedPostgreSqlContainer | undefined;

export async function setup() {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  writeFileSync(TEST_PG_URL_FILE, container.getConnectionUri(), "utf8");
}

export async function teardown() {
  if (container) {
    await container.stop();
    container = undefined;
  }
}
