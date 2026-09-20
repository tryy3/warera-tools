import { eq, inArray } from "drizzle-orm";
import { computeBattleBonus } from "../battle-bonus/compute";
import type { BattleBonusFacts, BattleBonusResult, BattleSide, OrderPriority } from "../battle-bonus/types";
import { listBattleOrders } from "../db/battle-orders";
import { listFightDeskBattles, listLatestMuDamageByBattle, type BattleStripRow } from "../db/battle-strip";
import type { Db } from "../db/client";
import { getRegionsByIds } from "../db/regions";
import { battleBonusFacts, countries, countryDiplomacy, mus } from "../db/schema";
import type { ParsedBattleOrder } from "../warera/battle-orders";

export type MuFightDeskBattle = {
  id: string;
  regionName: string | null;
  attackerCountryId: string | null;
  defenderCountryId: string | null;
  attackerIsoCode: string | null;
  defenderIsoCode: string | null;
  kind: "mu_order" | "country_order" | "both";
  muOrderSide: BattleSide | null;
  countryOrderSide: BattleSide | null;
  isRevolt: boolean;
  muDamageToDate: number | null;
  bonus: BattleBonusResult;
};

function parseHq(activeUpgradeLevels: Record<string, unknown> | null | undefined): {
  hqLevel: number | null;
  hqRunning: boolean | null;
} {
  if (activeUpgradeLevels == null) {
    return { hqLevel: null, hqRunning: null };
  }
  const raw = Number(activeUpgradeLevels.headquarters);
  if (!Number.isFinite(raw) || raw < 1 || raw > 4) {
    return { hqLevel: null, hqRunning: null };
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
  let countryOrderSide =
    muCountryId == null ? null : sideFromCountryOrders(row, muCountryId);
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

function opponentCountryId(fightSide: BattleSide, attackerCountryId: string, defenderCountryId: string): string {
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
  let swornEnemy: BattleBonusFacts["swornEnemy"] = null;
  if (diplomacy.swornEnemyId === opponentId) {
    const ageDays = floorAgeDays(diplomacy.swornEnemySince, now);
    if (ageDays != null) {
      swornEnemy = { ageDays };
    }
  }

  let defendingPactPartner: BattleBonusFacts["defendingPactPartner"] = null;
  if (fightSide === "defender") {
    const pacts = diplomacy.defensivePacts ?? [];
    const partner = pacts.find((p) => p.countryId === defenderCountryId);
    if (partner?.since) {
      const since = new Date(partner.since);
      const ageDays = floorAgeDays(since, now);
      if (ageDays != null) {
        defendingPactPartner = { ageDays };
      }
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
  diplomacy: typeof countryDiplomacy.$inferSelect | undefined,
  now: Date,
): BattleBonusFacts {
  const attackerCountryId = row.attackerCountryId ?? "";
  const defenderCountryId = row.defenderCountryId ?? "";
  const fightSide = orders.muOrderSide ?? orders.countryOrderSide ?? "attacker";

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
    allianceWorldShare: diplomacy?.allianceWorldShare ?? null,
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
  const ordersByBattle = new Map<string, ParsedBattleOrder[]>();
  await Promise.all(
    battleIds.map(async (battleId) => {
      ordersByBattle.set(battleId, await listBattleOrders(db, battleId));
    }),
  );

  const damageByBattle = await listLatestMuDamageByBattle(db, muId, battleIds);

  const factsRows =
    battleIds.length === 0
      ? []
      : await db
          .select()
          .from(battleBonusFacts)
          .where(inArray(battleBonusFacts.battleId, battleIds));
  const factsByBattle = new Map(factsRows.map((row) => [row.battleId, row]));

  const diplomacyRows =
    muCountryId.length === 0
      ? []
      : await db
          .select()
          .from(countryDiplomacy)
          .where(eq(countryDiplomacy.countryId, muCountryId))
          .limit(1);
  const diplomacy = diplomacyRows[0];

  const regionIds = stripRows.flatMap((row) =>
    [row.defenderRegionId, row.attackerRegionId].filter((id): id is string => id != null && id.length > 0),
  );
  const regionsById = await getRegionsByIds(db, regionIds);

  const countryIds = [
    ...new Set(
      stripRows.flatMap((row) =>
        [row.attackerCountryId, row.defenderCountryId].filter(
          (id): id is string => id != null && id.length > 0,
        ),
      ),
    ),
  ];
  const countryRows =
    countryIds.length === 0
      ? []
      : await db
          .select({ id: countries.id, isoCode: countries.isoCode })
          .from(countries)
          .where(inArray(countries.id, countryIds));
  const isoByCountry = new Map(countryRows.map((row) => [row.id, row.isoCode ?? null]));

  const cards: MuFightDeskBattle[] = [];

  for (const row of stripRows) {
    const orders = mergeOrderSides(row, muId, muCountryId || null, ordersByBattle.get(row.id) ?? []);
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
      isRevolt: factsRow?.isRevolt ?? false,
      muDamageToDate: damage === undefined ? null : damage,
      bonus: computeBattleBonus(
        buildBonusFacts(row, muCountryId, hq, orders, factsRow, diplomacy, now),
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
