import { Hono } from "hono";
import { mapInventoryToLoadout } from "../../battle-build/map-inventory";
import { quoteBatch, type QuoteLineInput, type QuoteTx } from "../../battle-build/quote";
import { emptyLoadout } from "../../battle-build/slots";
import type { Db } from "../../db/client";
import { listItemMarketTxForItemCodes } from "../../db/item-market-tx-read";
import { parseSkillNumbers } from "../../equipment/skills";
import type { Logger } from "../../logging/logger";
import { fetchCurrentEquipment, parseInventoryEquipment } from "../../warera/inventory";
import type { WareraRequester } from "../../warera/prices";
import { HttpError } from "../errors";

export type BattleBuildRouteDeps = {
  db: Db;
  warera: WareraRequester;
  logger: Logger;
};

function parseQuoteItems(body: unknown): QuoteLineInput[] {
  if (body === null || typeof body !== "object" || !("items" in body)) {
    throw new HttpError(400, "bad_request", "items must be an array");
  }

  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    throw new HttpError(400, "bad_request", "items must be an array");
  }
  if (items.length > 16) {
    throw new HttpError(400, "bad_request", "items must contain at most 16 entries");
  }

  return items.map((item, index) => {
    if (item === null || typeof item !== "object") {
      throw new HttpError(400, "bad_request", `items[${index}] must be an object`);
    }
    const { id, itemCode, skills } = item as Record<string, unknown>;
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new HttpError(400, "bad_request", `items[${index}].id is required`);
    }
    if (typeof itemCode !== "string" || itemCode.trim().length === 0) {
      throw new HttpError(400, "bad_request", `items[${index}].itemCode is required`);
    }
    const skillRecord =
      skills !== null && typeof skills === "object" && !Array.isArray(skills)
        ? (skills as Record<string, unknown>)
        : null;
    return {
      id,
      itemCode,
      skills: parseSkillNumbers(skillRecord) ?? null,
    };
  });
}

export function battleBuildRoutes(deps: BattleBuildRouteDeps) {
  const app = new Hono();

  app.get("/import", async (c) => {
    const userId = c.req.query("userId")?.trim();
    if (!userId) {
      throw new HttpError(400, "bad_request", "userId is required");
    }

    const recordedAt = new Date().toISOString();
    try {
      const raw = await fetchCurrentEquipment(deps.warera, userId);
      const { loadout, warnings } = mapInventoryToLoadout(parseInventoryEquipment(raw));
      return c.json({
        slots: loadout,
        error: warnings.length > 0 ? warnings.join("; ") : null,
        recordedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import equipment";
      deps.logger.warn({ user_id: userId, error: message }, "battle-build equipment import failed");
      return c.json({
        slots: emptyLoadout(),
        error: message,
        recordedAt,
      });
    }
  });

  app.post("/quote", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new HttpError(400, "bad_request", "body must be valid JSON");
    }
    const items = parseQuoteItems(body);
    const rows = await listItemMarketTxForItemCodes(
      deps.db,
      items.map((item) => item.itemCode),
    );
    const txsByCode = new Map<string, QuoteTx[]>();
    for (const row of rows) {
      const transactions = txsByCode.get(row.itemCode) ?? [];
      transactions.push({
        money: row.money,
        createdAtMs: row.createdAt.getTime(),
        skills: parseSkillNumbers(row.skills) ?? {},
      });
      txsByCode.set(row.itemCode, transactions);
    }

    const quotedAt = new Date();
    return c.json({
      results: quoteBatch(items, txsByCode, quotedAt.getTime()),
      quotedAt: quotedAt.toISOString(),
    });
  });

  return app;
}
