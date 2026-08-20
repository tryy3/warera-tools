import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "./client";
import * as schema from "./schema";
import { players } from "./schema";
import { upsertPlayerCurrent } from "./players";

async function createDb(): Promise<Db> {
  const dir = mkdtempSync(join(tmpdir(), "players-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT,
      mu_id TEXT,
      workplace_company_id TEXT,
      payload TEXT,
      fetched_at INTEGER
    )
  `);
  return drizzle(client, { schema });
}

async function getPlayer(db: Db, id: string) {
  const rows = await db
    .select({
      id: players.id,
      username: players.username,
      muId: players.muId,
      workplaceCompanyId: players.workplaceCompanyId,
      payload: players.payload,
      fetchedAt: players.fetchedAt,
    })
    .from(players)
    .where(eq(players.id, id));
  return rows[0];
}

describe("players db", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  it("upserts a new player", async () => {
    const t1 = new Date("2026-08-21T00:00:00.000Z");
    await upsertPlayerCurrent(db, {
      id: "p1",
      username: "alice",
      muId: "mu1",
      workplaceCompanyId: "c1",
      payload: { hp: 100 },
      fetchedAt: t1,
    });

    const row = await getPlayer(db, "p1");
    expect(row).toEqual({
      id: "p1",
      username: "alice",
      muId: "mu1",
      workplaceCompanyId: "c1",
      payload: { hp: 100 },
      fetchedAt: t1,
    });
  });

  it("upsert updates username, muId, workplaceCompanyId and fetchedAt", async () => {
    const t1 = new Date("2026-08-21T00:00:00.000Z");
    const t2 = new Date("2026-08-21T12:00:00.000Z");
    await upsertPlayerCurrent(db, {
      id: "p1",
      username: "alice",
      muId: "mu1",
      workplaceCompanyId: "c1",
      payload: { hp: 100 },
      fetchedAt: t1,
    });

    await upsertPlayerCurrent(db, {
      id: "p1",
      username: "alice2",
      muId: "mu2",
      workplaceCompanyId: "c2",
      payload: { hp: 50 },
      fetchedAt: t2,
    });

    const row = await getPlayer(db, "p1");
    expect(row).toEqual({
      id: "p1",
      username: "alice2",
      muId: "mu2",
      workplaceCompanyId: "c2",
      payload: { hp: 50 },
      fetchedAt: t2,
    });
  });

  it("upsert handles null fields", async () => {
    const t1 = new Date("2026-08-21T00:00:00.000Z");
    await upsertPlayerCurrent(db, {
      id: "p1",
      username: null,
      muId: null,
      workplaceCompanyId: null,
      payload: null,
      fetchedAt: t1,
    });

    const row = await getPlayer(db, "p1");
    expect(row).toEqual({
      id: "p1",
      username: null,
      muId: null,
      workplaceCompanyId: null,
      payload: null,
      fetchedAt: t1,
    });
  });
});
