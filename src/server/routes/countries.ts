import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../../db/client";
import { countries } from "../../db/schema";
import { HttpError } from "../errors";
import { parseTaxRate, slugifyCountryId } from "../slug";

export type CountriesRouteDeps = {
  db: Db;
};

function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return message.includes("unique constraint") || message.includes("unique constraint failed");
}

async function assertNoCountryConflict(
  db: Db,
  fields: { id?: string; name?: string; excludeId?: string },
): Promise<void> {
  const { id, name, excludeId } = fields;

  if (id !== undefined) {
    const byId = await db
      .select({ id: countries.id })
      .from(countries)
      .where(eq(countries.id, id))
      .limit(1);
    if (byId[0] && byId[0].id !== excludeId) {
      throw new HttpError(409, "conflict", "Country already exists");
    }
  }

  if (name !== undefined) {
    const byName = await db
      .select({ id: countries.id })
      .from(countries)
      .where(eq(countries.name, name))
      .limit(1);
    if (byName[0] && byName[0].id !== excludeId) {
      throw new HttpError(409, "conflict", "Country already exists");
    }
  }
}

function parseJsonBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_body", "Request body must be an object");
  }
  return body as Record<string, unknown>;
}

export function countriesRoutes(deps: CountriesRouteDeps) {
  const { db } = deps;
  const app = new Hono();

  app.get("/", async (c) => {
    const rows = await db.select().from(countries);
    return c.json({ countries: rows });
  });

  app.post("/", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HttpError(400, "invalid_body", "Request body must be JSON");
    }

    const body = parseJsonBody(raw);
    const { name, taxRate: taxRateRaw, id: idRaw } = body;

    if (typeof name !== "string" || name.trim() === "") {
      throw new HttpError(400, "invalid_body", "name must be a non-empty string");
    }

    const taxRate = parseTaxRate(taxRateRaw);
    let id: string;
    if (idRaw === undefined) {
      id = slugifyCountryId(name);
    } else if (typeof idRaw === "string" && idRaw.trim() !== "") {
      id = idRaw.trim();
    } else {
      throw new HttpError(400, "invalid_body", "id must be a non-empty string");
    }

    const trimmedName = name.trim();
    await assertNoCountryConflict(db, { id, name: trimmedName });

    const now = new Date();
    try {
      await db.insert(countries).values({
        id,
        name: trimmedName,
        taxRate,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new HttpError(409, "conflict", "Country already exists");
      }
      throw err;
    }

    const rows = await db.select().from(countries).where(eq(countries.id, id)).limit(1);
    return c.json({ country: rows[0] });
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await db.select().from(countries).where(eq(countries.id, id)).limit(1);
    if (!existing[0]) {
      throw new HttpError(404, "not_found", `Country ${id} not found`);
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HttpError(400, "invalid_body", "Request body must be JSON");
    }

    const body = parseJsonBody(raw);
    const patch: { name?: string; taxRate?: number; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        throw new HttpError(400, "invalid_body", "name must be a non-empty string");
      }
      patch.name = body.name.trim();
    }

    if (body.taxRate !== undefined) {
      patch.taxRate = parseTaxRate(body.taxRate);
    }

    if (patch.name === undefined && patch.taxRate === undefined) {
      return c.json({ country: existing[0] });
    }

    if (patch.name !== undefined) {
      await assertNoCountryConflict(db, { name: patch.name, excludeId: id });
    }

    try {
      await db.update(countries).set(patch).where(eq(countries.id, id));
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new HttpError(409, "conflict", "Country already exists");
      }
      throw err;
    }

    const rows = await db.select().from(countries).where(eq(countries.id, id)).limit(1);
    return c.json({ country: rows[0] });
  });

  return app;
}
