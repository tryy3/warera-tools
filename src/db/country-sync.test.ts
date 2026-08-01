import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { WareraCountryRow } from "../warera/countries";
import type { Db } from "./client";
import { syncCountriesFromWarera } from "./country-sync";
import * as schema from "./schema";
import { seedDefaultCountries } from "./seed-countries";

async function createMemoryDb(): Promise<Db> {
  // Temp file DB: libsql :memory: loses schema across drizzle transactions.
  const dir = mkdtempSync(join(tmpdir(), "country-sync-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  await client.execute(`
    CREATE TABLE countries (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      tax_rate REAL NOT NULL,
      iso_code TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      synced_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return drizzle(client, { schema });
}

async function insertCountry(
  db: Db,
  row: {
    id: string;
    name: string;
    taxRate: number;
    isoCode?: string | null;
    source?: "warera" | "manual";
    syncedAt?: Date | null;
  },
): Promise<void> {
  const now = new Date("2026-01-01T00:00:00.000Z");
  await db.insert(schema.countries).values({
    id: row.id,
    name: row.name,
    taxRate: row.taxRate,
    isoCode: row.isoCode ?? null,
    source: row.source ?? "manual",
    syncedAt: row.syncedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

const WARERA_SWEDEN: WareraCountryRow = {
  id: "warera-sweden-id",
  name: "Sweden",
  isoCode: "SE",
  taxRate: 0.05,
};

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("syncCountriesFromWarera", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("inserts when empty", async () => {
    const result = await syncCountriesFromWarera(db, [WARERA_SWEDEN], NOW);

    expect(result).toEqual({ total: 1, inserted: 1, updated: 0, migrated: 0 });

    const rows = await db.select().from(schema.countries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "warera-sweden-id",
      name: "Sweden",
      isoCode: "SE",
      taxRate: 0.05,
      source: "warera",
      syncedAt: NOW,
    });
  });

  it("updates when id matches", async () => {
    await insertCountry(db, {
      id: "warera-sweden-id",
      name: "Old Sweden",
      taxRate: 0.01,
      isoCode: "XX",
      source: "manual",
    });

    const result = await syncCountriesFromWarera(db, [WARERA_SWEDEN], NOW);

    expect(result).toEqual({ total: 1, inserted: 0, updated: 1, migrated: 0 });

    const rows = await db.select().from(schema.countries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "warera-sweden-id",
      name: "Sweden",
      isoCode: "SE",
      taxRate: 0.05,
      source: "warera",
      syncedAt: NOW,
    });
  });

  it("migrates sweden + isoCode SE to WarEra Sweden id", async () => {
    await insertCountry(db, {
      id: "sweden",
      name: "Sweden",
      taxRate: 0.01,
      isoCode: "SE",
      source: "manual",
    });

    const result = await syncCountriesFromWarera(db, [WARERA_SWEDEN], NOW);

    expect(result).toEqual({ total: 1, inserted: 0, updated: 1, migrated: 1 });

    const rows = await db.select().from(schema.countries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "warera-sweden-id",
      name: "Sweden",
      isoCode: "SE",
      taxRate: 0.05,
      source: "warera",
      syncedAt: NOW,
    });
  });

  it("leaves unrelated manual row untouched", async () => {
    await insertCountry(db, {
      id: "custom-land",
      name: "Custom Land",
      taxRate: 0.1,
      isoCode: "CL",
      source: "manual",
    });

    const result = await syncCountriesFromWarera(db, [WARERA_SWEDEN], NOW);

    expect(result).toEqual({ total: 1, inserted: 1, updated: 0, migrated: 0 });

    const rows = await db.select().from(schema.countries);
    expect(rows).toHaveLength(2);

    const custom = rows.find((r) => r.id === "custom-land");
    expect(custom).toMatchObject({
      id: "custom-land",
      name: "Custom Land",
      taxRate: 0.1,
      isoCode: "CL",
      source: "manual",
      syncedAt: null,
    });

    const sweden = rows.find((r) => r.id === "warera-sweden-id");
    expect(sweden).toMatchObject({
      id: "warera-sweden-id",
      name: "Sweden",
      source: "warera",
      syncedAt: NOW,
    });
  });
});

describe("seedDefaultCountries", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
  });

  it("inserts Sweden bootstrap only when empty", async () => {
    await seedDefaultCountries(db);

    const rows = await db.select().from(schema.countries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "sweden",
      name: "Sweden",
      taxRate: 0.01,
      isoCode: "SE",
      source: "manual",
      syncedAt: null,
    });
  });

  it("is a no-op when any country exists", async () => {
    await insertCountry(db, {
      id: "norway",
      name: "Norway",
      taxRate: 0.02,
      isoCode: "NO",
    });

    await seedDefaultCountries(db);

    const rows = await db.select().from(schema.countries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("norway");
  });
});
