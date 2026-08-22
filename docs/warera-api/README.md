# WarEra API & data docs

Living documentation for how this app talks to WarEra, classifies data, and routes traffic through the in-process access facade (`createWareraClient` → api2).

## Documents

| Doc | Purpose |
| --- | --- |
| [inventory.md](./inventory.md) | **As-is** catalog: tiers, who refreshes, cadence, upstream, storage style, consumers |
| [vision.md](./vision.md) | **Architectural direction**: access facade, cadence policy, cache matrix, domain lib, observability (logs + decoupled metrics → Sentry first) |

Split further under this folder when a chapter outgrows a single file (e.g. `caching.md`, `cadence.md`).

## Related

| Resource | Role |
| --- | --- |
| [AGENTS.md](../../AGENTS.md) | Short tier summary + project architecture |
| [Data tier caching strategy](../superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md) | Approved Global / Geo / User rules |
| [Tracking spec](../superpowers/specs/2026-08-06-warera-api-access-vision-design.md) | Approved intent for this workstream |
| [Access facade design](../superpowers/specs/2026-08-22-warera-access-facade-design.md) | Approved v1 implementation spec (api2-only facade, governor, batch/dedup, metrics) |
| [`.agents/skills/warera-api/`](../../.agents/skills/warera-api/SKILL.md) | Allowlist, auth, gateway/api2 call preferences |
| [`.agents/skills/warera-game-mechanics/`](../../.agents/skills/warera-game-mechanics/SKILL.md) | Economy formulas (not HTTP) |

## Maintenance

- Update **inventory** on larger structural / data-flow changes (add/remove/materially change jobs, tiers, cadence/TTL, storage style, upstream, or major consumers). Small detail work does not need an inventory pass.
- Update **vision** only when we explicitly revise architectural direction — not as a regular checklist item.
- Prefer high-level facts over schemas and code dumps so these stay cheap to keep current.
- See also the inventory note in [AGENTS.md](../../AGENTS.md).
