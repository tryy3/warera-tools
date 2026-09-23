import { eq, inArray, sql } from "drizzle-orm";
import { RAMP_MAX, RAMP_PER_DAY } from "../battle-bonus/constants";
import { computeBattleBonus } from "../battle-bonus/compute";
import type { BattleBonusFacts, BattleSide, OrderPriority } from "../battle-bonus/types";
import { listBattleOrders } from "../db/battle-orders";
import {
  listFightDeskBattles,
  listLatestMuDamageByBattle,
  type BattleStripRow,
} from "../db/battle-strip";
import type { Db } from "../db/client";
import { getRegionsByIds } from "../db/regions";
import { alliances, battleBonusFacts, countries, countryDiplomacy, mus } from "../db/schema";
import type { ParsedBattleOrder } from "../warera/battle-orders";
import type { MuFightDeskBattle } from "../web/features/mu/types";

function parseHq(activeUpgradeLevels: Record<string, unknown> | null | undefined): {
  hqLevel: number | null;
  hqRunning: boolean;
} {
  if (activeUpgradeLevels == null) {
    return { hqLevel: null, hqRunning: false };
  }
  const raw = Number(activeUpgradeLevels.headquarters);
  if (!Number.isFinite(raw) || raw < 1 || raw > 4) {
    return { hqLevel: null, hqRunning: false };
  }
  const hqLevel = Math.floor(raw);
  return { hqLevel, hqRunning: hqLevel != null };
}

function floorAgeDays(since: Date | null | undefined, now: Date): number | null {
  if (since == null) return null;
  const ms = now.getTime() - since.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function sideFromMuOrders(row: BattleStripRow, muId: string): BattleSide | null {
  if (row.attackerMuOrders?.includes(muId)) return "attacker";
  if (row.defenderMuOrders?.includes(muId)) return "defender";
  return null;
}

function sideFromCountryOrders(row: BattleStripRow, countryId: string): BattleSide | null {
  if (row.attackerCountryOrders?.includes(countryId)) return "attacker";
  if (row.defenderCountryOrders?.includes(countryId)) return "defender";
  return null;
}

function mergeOrderSides(
  row: BattleStripRow,
  muId: string,
  muCountryId: string | null,
  orders: ParsedBattleOrder[],
): {
  muOrderSide: BattleSide | null;
  countryOrderSide: BattleSide | null;
  muOrderPriority: OrderPriority | null;
  countryOrderPriority: OrderPriority | null;
} {
  let muOrderSide = sideFromMuOrders(row, muId);
  let countryOrderSide = muCountryId == null ? null : sideFromCountryOrders(row, muCountryId);
  let muOrderPriority: OrderPriority | null = null;
  let countryOrderPriority: OrderPriority | null = null;

  for (const order of orders) {
    if (order.ownerType === "mu" && order.ownerId === muId) {
      muOrderSide = order.side;
      muOrderPriority = order.priority;
    }
    if (order.ownerType === "country" && muCountryId != null && order.ownerId === muCountryId) {
      countryOrderSide = order.side;
      countryOrderPriority = order.priority;
    }
  }

  return { muOrderSide, countryOrderSide, muOrderPriority, countryOrderPriority };
}

function battleKind(
  muOrderSide: BattleSide | null,
  countryOrderSide: BattleSide | null,
): MuFightDeskBattle["kind"] | null {
  const hasMu = muOrderSide != null;
  const hasCountry = countryOrderSide != null;
  if (hasMu && hasCountry) return "both";
  if (hasMu) return "mu_order";
  if (hasCountry) return "country_order";
  return null;
}

function kindSortRank(kind: MuFightDeskBattle["kind"]): number {
  return kind === "country_order" ? 1 : 0;
}

function alliedFortHalf(
  muCountryId: string,
  fightSide: BattleSide,
  attackerCountryId: string,
  defenderCountryId: string,
): boolean {
  const orderedSideCountryId = fightSide === "attacker" ? attackerCountryId : defenderCountryId;
  return muCountryId !== orderedSideCountryId;
}

function supportingAllianceMember(
  muCountryId: string,
  orderedSideCountryId: string,
  allianceIdByCountry: Map<string, string | null>,
): boolean | null {
  const muAllianceId = allianceIdByCountry.get(muCountryId);
  const sideAllianceId = allianceIdByCountry.get(orderedSideCountryId);
  if (muAllianceId == null) return null;
  if (sideAllianceId == null) return false;
  return muAllianceId === sideAllianceId;
}

function allianceWorldShareFromCores(
  muCountryId: string,
  allianceIdByCountry: Map<string, string | null>,
  allianceCoreById: Map<string, number | null>,
  worldCore: number | null,
  fallbackShare: number | null,
): number | null {
  const allianceId = allianceIdByCountry.get(muCountryId);
  if (allianceId == null) return fallbackShare;
  const allianceCore = allianceCoreById.get(allianceId);
  if (allianceCore == null || worldCore == null || worldCore <= 0) return fallbackShare;
  return allianceCore / worldCore;
}

function opponentCountryId(
  fightSide: BattleSide,
  attackerCountryId: string,
  defenderCountryId: string,
): string {
  return fightSide === "attacker" ? defenderCountryId : attackerCountryId;
}

function diplomacyRampPartners(
  diplomacy: typeof countryDiplomacy.$inferSelect | undefined,
  fightSide: BattleSide,
  attackerCountryId: string,
  defenderCountryId: string,
  now: Date,
): Pick<BattleBonusFacts, "defendingPactPartner" | "swornEnemy"> {
  if (diplomacy == null) {
    return { defendingPactPartner: null, swornEnemy: null };
  }

  const opponentId = opponentCountryId(fightSide, attackerCountryId, defenderCountryId);
  const fullRampDays = Math.round(RAMP_MAX / RAMP_PER_DAY);
  let swornEnemy: BattleBonusFacts["swornEnemy"] = null;
  if (diplomacy.swornEnemyId === opponentId) {
    swornEnemy = { ageDays: floorAgeDays(diplomacy.swornEnemySince, now) ?? fullRampDays };
  }

  let defendingPactPartner: BattleBonusFacts["defendingPactPartner"] = null;
  if (fightSide === "defender") {
    const pacts = diplomacy.defensivePacts ?? [];
    const partner = pacts.find((p) => p.countryId === defenderCountryId);
    if (partner) {
      const since = partner.since ? new Date(partner.since) : null;
      const ageDays =
        since != null && !Number.isNaN(since.getTime())
          ? (floorAgeDays(since, now) ?? fullRampDays)
          : fullRampDays;
      defendingPactPartner = { ageDays };
    }
  }

  return { defendingPactPartner, swornEnemy };
}

function buildBonusFacts(
  row: BattleStripRow,
  muCountryId: string,
  hq: ReturnType<typeof parseHq>,
  orders: ReturnType<typeof mergeOrderSides>,
  factsRow: typeof battleBonusFacts.$inferSelect | undefined,
  diplomacyByCountry: Map<string, typeof countryDiplomacy.$inferSelect>,
  allianceIdByCountry: Map<string, string | null>,
  allianceCoreById: Map<string, number | null>,
  worldCore: number | null,
  now: Date,
): BattleBonusFacts {
  const attackerCountryId = row.attackerCountryId ?? "";
  const defenderCountryId = row.defenderCountryId ?? "";
  const fightSide = orders.muOrderSide ?? orders.countryOrderSide ?? "attacker";
  const orderedSideCountryId = fightSide === "attacker" ? attackerCountryId : defenderCountryId;
  const diplomacy = diplomacyByCountry.get(muCountryId);

  return {
    fightSide,
    muCountryId,
    attackerCountryId,
    defenderCountryId,
    isRevolt: factsRow?.isRevolt ?? false,
    countryOrderPriority: orders.countryOrderPriority,
    muOrderPriority: orders.muOrderPriority,
    hqLevel: hq.hqLevel,
    hqRunning: hq.hqRunning,
    allianceWorldShare: allianceWorldShareFromCores(
      muCountryId,
      allianceIdByCountry,
      allianceCoreById,
      worldCore,
      diplomacy?.allianceWorldShare ?? null,
    ),
    supportingAllianceMember: supportingAllianceMember(
      muCountryId,
      orderedSideCountryId,
      allianceIdByCountry,
    ),
    ...diplomacyRampPartners(diplomacy, fightSide, attackerCountryId, defenderCountryId, now),
    bunkerLevel: factsRow?.bunkerLevel ?? null,
    bunkerActive: factsRow?.bunkerActive ?? null,
    militaryBaseLevel: factsRow?.militaryBaseLevel ?? null,
    militaryBaseActive: factsRow?.militaryBaseActive === true,
    resistance: factsRow?.resistance ?? null,
    defenderSupplyLinked: factsRow?.defenderSupplyLinked ?? null,
    alliedFortHalf: alliedFortHalf(muCountryId, fightSide, attackerCountryId, defenderCountryId),
  };
}

function asFiniteNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadFightDeskBattles(
  db: Db,
  muId: string,
  now: Date = new Date(),
): Promise<MuFightDeskBattle[]> {
  const [muRow] = await db
    .select({
      countryId: mus.countryId,
      activeUpgradeLevels: mus.activeUpgradeLevels,
    })
    .from(mus)
    .where(eq(mus.id, muId))
    .limit(1);

  const muCountryId = muRow?.countryId ?? "";
  const hq = parseHq(muRow?.activeUpgradeLevels ?? null);
  const stripRows = await listFightDeskBattles(db, muId);
  if (stripRows.length === 0) return [];

  const battleIds = stripRows.map((row) => row.id);
  const regionIds = stripRows.flatMap((row) =>
    [row.defenderRegionId, row.attackerRegionId].filter(
      (id): id is string => id != null && id.length > 0,
    ),
  );
  const countryIds = [
    ...new Set(
      [
        muCountryId,
        ...stripRows.flatMap((row) => [row.attackerCountryId, row.defenderCountryId]),
      ].filter((id): id is string => id != null && id.length > 0),
    ),
  ];

  const ordersByBattle = new Map<string, ParsedBattleOrder[]>();
  const [
    ,
    damageByBattle,
    factsRows,
    diplomacyRows,
    regionsById,
    countryRows,
    worldCoreRow,
    allianceRows,
  ] = await Promise.all([
    Promise.all(
      battleIds.map(async (battleId) => {
        ordersByBattle.set(battleId, await listBattleOrders(db, battleId));
      }),
    ),
    listLatestMuDamageByBattle(db, muId, battleIds),
    battleIds.length === 0
      ? Promise.resolve([])
      : db.select().from(battleBonusFacts).where(inArray(battleBonusFacts.battleId, battleIds)),
    countryIds.length === 0
      ? Promise.resolve([])
      : db.select().from(countryDiplomacy).where(inArray(countryDiplomacy.countryId, countryIds)),
    getRegionsByIds(db, regionIds),
    countryIds.length === 0
      ? Promise.resolve([] as { id: string; isoCode: string | null; allianceId: string | null }[])
      : db
          .select({
            id: countries.id,
            isoCode: countries.isoCode,
            allianceId: countries.allianceId,
          })
          .from(countries)
          .where(inArray(countries.id, countryIds)),
    db
      .select({
        worldCore: sql<string | number | null>`sum(${countries.coreDevelopment})`,
      })
      .from(countries)
      .then((rows) => rows[0] ?? { worldCore: null }),
    db.select({ id: alliances.id, coreDevelopment: alliances.coreDevelopment }).from(alliances),
  ]);
  const factsByBattle = new Map(factsRows.map((row) => [row.battleId, row]));
  const diplomacyByCountry = new Map(diplomacyRows.map((row) => [row.countryId, row]));
  const isoByCountry = new Map(countryRows.map((row) => [row.id, row.isoCode ?? null]));
  const allianceIdByCountry = new Map<string, string | null>();
  for (const row of countryRows) {
    allianceIdByCountry.set(row.id, row.allianceId);
  }
  for (const [countryId, diplomacy] of diplomacyByCountry) {
    if (allianceIdByCountry.get(countryId) == null && diplomacy.allianceId != null) {
      allianceIdByCountry.set(countryId, diplomacy.allianceId);
    }
  }
  const allianceCoreById = new Map(allianceRows.map((row) => [row.id, row.coreDevelopment]));
  const worldCore = asFiniteNumber(worldCoreRow.worldCore);

  const cards: MuFightDeskBattle[] = [];

  for (const row of stripRows) {
    const orders = mergeOrderSides(
      row,
      muId,
      muCountryId || null,
      ordersByBattle.get(row.id) ?? [],
    );
    const kind = battleKind(orders.muOrderSide, orders.countryOrderSide);
    if (kind == null) continue;

    const factsRow = factsByBattle.get(row.id);
    const regionId = row.defenderRegionId ?? row.attackerRegionId;
    const regionName = regionId != null ? (regionsById.get(regionId)?.name ?? null) : null;
    const damage = damageByBattle.get(row.id);

    cards.push({
      id: row.id,
      regionName,
      attackerCountryId: row.attackerCountryId,
      defenderCountryId: row.defenderCountryId,
      attackerIsoCode:
        row.attackerCountryId != null ? (isoByCountry.get(row.attackerCountryId) ?? null) : null,
      defenderIsoCode:
        row.defenderCountryId != null ? (isoByCountry.get(row.defenderCountryId) ?? null) : null,
      kind,
      muOrderSide: orders.muOrderSide,
      countryOrderSide: orders.countryOrderSide,
      muCountryIsoCode:
        muCountryId.length > 0 ? (isoByCountry.get(muCountryId) ?? muCountryId) : null,
      isRevolt: factsRow?.isRevolt ?? false,
      muDamageToDate: damage === undefined ? null : damage,
      bonus: computeBattleBonus(
        buildBonusFacts(
          row,
          muCountryId,
          hq,
          orders,
          factsRow,
          diplomacyByCountry,
          allianceIdByCountry,
          allianceCoreById,
          worldCore,
          now,
        ),
      ),
    });
  }

  cards.sort((a, b) => {
    const byKind = kindSortRank(a.kind) - kindSortRank(b.kind);
    if (byKind !== 0) return byKind;
    const regionA = a.regionName ?? "";
    const regionB = b.regionName ?? "";
    if (regionA !== regionB) return regionA.localeCompare(regionB);
    return a.id.localeCompare(b.id);
  });

  return cards;
}
