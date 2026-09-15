import type { FightPlayerInput, PillStatus } from "../fight-damage/types";

export type ParsedFightState = FightPlayerInput & {
  username: string;
  level: number;
  militaryRankBonus: number;
  ammoLabel: string | null;
  pillLabel: string | null;
  pillEndsAt: Date | null;
  skillLevels: Record<string, number>;
  lastSkillsResetAt: Date | null;
  avatarUrl: string | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePillStatus(attack: UnknownRecord): PillStatus {
  const buffsPercent = finiteNumber(attack, "buffsPercent") ?? 0;
  const debuffsPercent = finiteNumber(attack, "debuffsPercent") ?? 0;
  if (buffsPercent !== 0) return "active";
  if (debuffsPercent !== 0) return "debuff";
  return "ready";
}

export function parseFightState(raw: unknown): ParsedFightState | null {
  const user = asRecord(raw);
  const skills = asRecord(user?.skills);
  const attack = asRecord(skills?.attack);
  const precision = asRecord(skills?.precision);
  const criticalChance = asRecord(skills?.criticalChance);
  const criticalDamages = asRecord(skills?.criticalDamages);
  const armor = asRecord(skills?.armor);
  const dodge = asRecord(skills?.dodge);
  const health = asRecord(skills?.health);
  const hunger = asRecord(skills?.hunger);
  const leveling = asRecord(user?.leveling);

  if (
    !user ||
    !skills ||
    !attack ||
    !precision ||
    !criticalChance ||
    !criticalDamages ||
    !armor ||
    !dodge ||
    !health ||
    !hunger ||
    !leveling
  ) {
    return null;
  }

  const userId = nonEmptyString(user, "_id");
  const username = nonEmptyString(user, "username");
  const level = finiteNumber(leveling, "level");
  const atk = finiteNumber(attack, "total");
  const precisionTotal = finiteNumber(precision, "total");
  const criticalChanceTotal = finiteNumber(criticalChance, "total");
  const criticalDamageTotal = finiteNumber(criticalDamages, "total");
  const armorTotal = finiteNumber(armor, "total");
  const dodgeTotal = finiteNumber(dodge, "total");
  const hp = finiteNumber(health, "currentBarValue");
  const maxHp = finiteNumber(health, "total");
  const hungerCurrent = finiteNumber(hunger, "currentBarValue");
  const maxHunger = finiteNumber(hunger, "total");
  const hpRegenPerHour = finiteNumber(health, "hourlyBarRegen");
  const hungerRegenPerHour = finiteNumber(hunger, "hourlyBarRegen");
  const militaryRankPercent = finiteNumber(attack, "militaryRankPercent");

  if (
    userId == null ||
    username == null ||
    level == null ||
    atk == null ||
    precisionTotal == null ||
    criticalChanceTotal == null ||
    criticalDamageTotal == null ||
    armorTotal == null ||
    dodgeTotal == null ||
    hp == null ||
    maxHp == null ||
    hungerCurrent == null ||
    maxHunger == null ||
    hpRegenPerHour == null ||
    hungerRegenPerHour == null ||
    militaryRankPercent == null
  ) {
    return null;
  }

  const skillLevels: Record<string, number> = {};
  for (const [skillName, value] of Object.entries(skills)) {
    const skill = asRecord(value);
    const skillLevel = skill && finiteNumber(skill, "level");
    if (skillLevel != null) skillLevels[skillName] = skillLevel;
  }

  const equipment = asRecord(user.equipment);
  const buffs = asRecord(user.buffs);
  const buffCodes = Array.isArray(buffs?.buffCodes) ? buffs.buffCodes : [];
  const pillLabel = buffCodes.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const dates = asRecord(user.dates);

  return {
    userId,
    username,
    level,
    atk,
    precision: precisionTotal / 100,
    critChance: criticalChanceTotal / 100,
    critDamage: criticalDamageTotal / 100,
    armor: armorTotal,
    dodge: dodgeTotal,
    hp,
    maxHp,
    hunger: hungerCurrent,
    maxHunger,
    hpRegenPerHour,
    hungerRegenPerHour,
    pillStatus: parsePillStatus(attack),
    militaryRankBonus: militaryRankPercent / 100,
    ammoLabel: equipment ? nonEmptyString(equipment, "ammo") : null,
    pillLabel: pillLabel ?? null,
    pillEndsAt: dateOrNull(buffs?.buffEndAt),
    skillLevels,
    lastSkillsResetAt: dateOrNull(dates?.lastSkillsResetAt),
    avatarUrl: nonEmptyString(user, "avatarUrl"),
  };
}

export function toFightPlayerInput(parsed: ParsedFightState): FightPlayerInput {
  return {
    userId: parsed.userId,
    atk: parsed.atk,
    precision: parsed.precision,
    critChance: parsed.critChance,
    critDamage: parsed.critDamage,
    armor: parsed.armor,
    dodge: parsed.dodge,
    hp: parsed.hp,
    maxHp: parsed.maxHp,
    hunger: parsed.hunger,
    maxHunger: parsed.maxHunger,
    hpRegenPerHour: parsed.hpRegenPerHour,
    hungerRegenPerHour: parsed.hungerRegenPerHour,
    pillStatus: parsed.pillStatus,
  };
}
