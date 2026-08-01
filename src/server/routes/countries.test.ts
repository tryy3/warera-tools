import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { Db } from "../../db/client";
import * as schema from "../../db/schema";
import { errorPayload, HttpError } from "../errors";
import { parseTaxRate } from "../slug";
import { assertNoCountryConflict, countriesRoutes } from "./countries";

async function createMemoryDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
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

function mountCountries(db: Db): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    const { status, body } = errorPayload(err);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.route("/", countriesRoutes({ db }));
  return app;
}

async function seedCountry(
  db: Db,
  row: { id: string; name: string; taxRate: number; isoCode?: string | null },
): Promise<void> {
  const now = new Date();
  await db.insert(schema.countries).values({
    id: row.id,
    name: row.name,
    taxRate: row.taxRate,
    isoCode: row.isoCode ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

describe("parseTaxRate (countries)", () => {
  it("rejects taxRate out of range", () => {
    expect(() => parseTaxRate(1.5)).toThrow(HttpError);
    expect(() => parseTaxRate(-0.1)).toThrow(HttpError);
    try {
      parseTaxRate(2);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
      expect((err as HttpError).code).toBe("invalid_body");
    }
  });
});

describe("assertNoCountryConflict", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createMemoryDb();
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
  });

  it("throws conflict on duplicate id", async () => {
    await expect(assertNoCountryConflict(db, { id: "sweden" })).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.status === 409 && err.code === "conflict",
    );
  });

  it("throws conflict on duplicate name", async () => {
    await expect(assertNoCountryConflict(db, { name: "Sweden" })).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.status === 409 && err.code === "conflict",
    );
  });

  it("allows same id when excludeId matches", async () => {
    await expect(
      assertNoCountryConflict(db, { id: "sweden", name: "Sweden", excludeId: "sweden" }),
    ).resolves.toBeUndefined();
  });
});

describe("countriesRoutes", () => {
  let db: Db;
  let app: Hono;

  beforeEach(async () => {
    db = await createMemoryDb();
    app = mountCountries(db);
    await seedCountry(db, { id: "sweden", name: "Sweden", taxRate: 0.01 });
  });

  it("POST rejects taxRate out of range", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Norway", taxRate: 1.5 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_body");
  });

  it("POST returns 409 on duplicate id/name", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sweden", taxRate: 0.02 }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("conflict");
  });

  it("PATCH unknown id returns 404", async () => {
    const res = await app.request("/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxRate: 0.02 }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("missing");
  });

  it("POST accepts isoCode and returns it uppercase", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Norway", taxRate: 0.02, isoCode: "no" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { country: { isoCode: string | null; name: string } };
    expect(body.country.name).toBe("Norway");
    expect(body.country.isoCode).toBe("NO");
  });

  it("POST rejects invalid isoCode", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Norway", taxRate: 0.02, isoCode: "NOR" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH can set and clear isoCode", async () => {
    const setRes = await app.request("/sweden", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isoCode: "se" }),
    });
    expect(setRes.status).toBe(200);
    expect(((await setRes.json()) as { country: { isoCode: string | null } }).country.isoCode).toBe(
      "SE",
    );

    const clearRes = await app.request("/sweden", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isoCode: null }),
    });
    expect(clearRes.status).toBe(200);
    expect(
      ((await clearRes.json()) as { country: { isoCode: string | null } }).country.isoCode,
    ).toBeNull();
  });
});
