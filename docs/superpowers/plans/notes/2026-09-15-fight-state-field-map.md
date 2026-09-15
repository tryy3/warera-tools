# Fight-state field map

Verified against live allowlisted `user.getUserLite` and `user.getUserById` on
2026-09-15. The sanitized fixture is a subset of the latter.

- Identity/display: `_id`, `username`, `avatarUrl`, `leveling.level`,
  `dates.lastSkillsResetAt`
- Damage: `skills.attack.total`; rank display:
  `skills.attack.militaryRankPercent`
- Percent inputs (divide by 100): `skills.precision.total`,
  `skills.criticalChance.total`, `skills.criticalDamages.total`
- Defense: `skills.armor.total`, `skills.dodge.total`
- Bars: `skills.{health,hunger}.{currentBarValue,total,hourlyBarRegen}`
- Pill: `skills.attack.buffsPercent`, `skills.attack.debuffsPercent`,
  `buffs.buffCodes`, `buffs.buffEndAt`
- Ammo label: `equipment.ammo`
- Skill levels: `skills.<skill>.level`

`user.getUserLite` had every fight input and active-pill metadata in the live
sample, but omitted `equipment`; `user.getUserById` returned the same fields
plus `equipment.ammo`, so it is the complete single-call source.

An active `cocain` payload and its end time were observed live. The debuff
status mapping uses the documented `skills.attack.debuffsPercent` field; a
nonzero debuff sample was not captured during this gate.
