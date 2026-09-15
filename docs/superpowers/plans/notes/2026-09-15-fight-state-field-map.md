# Fight-state field map

Verified against live allowlisted `user.getUserLite` and `user.getUserById` on
2026-09-15. The sanitized fixture is a subset of the latter.

- Identity/display: `_id`, `username`, `avatarUrl`, `leveling.level`,
  `dates.lastSkillsResetAt`
- Damage: `skills.attack.total`; rank display:
  `skills.attack.militaryRankPercent`
- Percent inputs (divide by 100): `skills.precision.total`,
  `skills.criticalChance.total`, `skills.criticalDamages.total`
- Defense: prefer `skills.{armor,dodge}.totalAfterSoftCap` when it is a finite
  number, then fall back to the corresponding `total`. Fight calculations need
  the effective post-soft-cap value, while the fallback keeps older or partial
  payloads usable.
- Bars: `skills.{health,hunger}.{currentBarValue,total,hourlyBarRegen}`
- Pill: `skills.attack.buffsPercent`, `skills.attack.debuffsPercent`,
  `buffs.buffCodes`, `buffs.buffEndAt`
- Ammo label: `equipment.ammo`
- Skill levels: `skills.<skill>.level`

`user.getUserLite` had every fight input and active-pill metadata in the live
sample, but omitted `equipment`; `user.getUserById` returned the same fields
plus `equipment.ammo`, so it is the complete single-call source.

An active `cocain` payload and its `buffs.buffEndAt` time were observed live.
The debuff status mapping uses the documented
`skills.attack.debuffsPercent !== 0` signal, but this gate captured no live
nonzero debuff sample. No allowlisted OpenAPI/community path for a debuff end
time was found in-repo, so the parser does not invent one: `pillEndsAt` remains
`null` during debuff, and the debuff countdown is incomplete until a timer path
is verified.

The current snapshot content fingerprint includes the live HP and hunger bars.
For active players those values commonly change between polls, so near-every
poll can append a snapshot even when their material combat configuration is
unchanged. Storage pruning and/or a material-change fingerprint that separates
volatile bars is intentionally deferred to a follow-up; this pass does not
redesign snapshot storage.
