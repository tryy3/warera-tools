# WarEra API access & caching vision — tracking spec

**Date:** 2026-08-06  
**Status:** Approved (directional)  
**Living docs:** [`docs/warera-api/`](../../warera-api/README.md)

## Intent

Track the approved architectural direction to:

1. Replace dependence on the community WarEraStats **gateway** with an **in-process access facade** talking to **api2**, with batching, dedup, and rate-limit governance tuned to our workloads.
2. Maintain a living **inventory** of WarEra-related data (tiers, cadence, storage, consumers) at a maintainable level of detail.
3. Standardize **caching layers** (DB / optional process memory / TanStack Query / localStorage) and tune **fetch cadence** using inventory + metrics.
4. Keep light directional guidance for a **domain library** map and **observability** (structured logs / Sentry).
5. Prefer **deepening the existing stack** (TanStack Query/Router/etc., Hono, Turso/Drizzle) over new libraries or parallel home-grown systems; build custom when the behavior is simple or WarEra-specific.

## Source of truth

| Topic | Document |
| --- | --- |
| As-is catalog | [docs/warera-api/inventory.md](../../warera-api/inventory.md) |
| Architecture vision | [docs/warera-api/vision.md](../../warera-api/vision.md) |
| Tier rules (unchanged by this approval) | [2026-08-02-data-tier-caching-strategy-design.md](./2026-08-02-data-tier-caching-strategy-design.md) |
| Allowlist / auth | `.agents/skills/warera-api/` |

Prefer editing the living docs under `docs/warera-api/` for substance. Update this tracking spec only when intent or status changes.

## Out of scope for this approval

Implementation plans, code, cron value changes, and localStorage key schemas — those follow writing-plans / separate PRs after inventory + vision review.

## Next step

After living docs are reviewed: optional implementation plan via writing-plans (facade skeleton first per vision sequencing).
