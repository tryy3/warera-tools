---
name: warera-api
description: Use WarEra's allowed public tRPC API (api2), endpoint allowlist, auth, rate limits, and project client preferences. Use when working with WarEra API calls, WARERA_API_*, src/warera/, tRPC procedures, api2.warera.io, or when the user mentions the WarEra API, rate limits, or public vs in-game endpoints.
---

# WarEra API

Game economy formulas (PP, companies, scrap tiers, tax) → [warera-game-mechanics](../warera-game-mechanics/SKILL.md).

## Allowed surface (hard rule)

The API we are **allowed** to use publicly is what is listed on the official docs:

- Docs UI: https://api2.warera.io/docs/
- Machine-readable: https://api2.warera.io/openapi.json

There are differences between what the game client can do in-game and what is allowed publicly. **Only endpoints exposed there are allowed.** Do not invent, scrape, or call endpoints outside that list (including undocumented `api5` / private game paths) unless the user explicitly overrides for a private experiment.

Community docs (response shapes, examples — not the allowlist source of truth):

- https://majimawrks.github.io/warera-api-docs/#/
- https://github.com/majimawrks/warera-api-docs

## Base URLs (project preference)

tRPC base path includes `/trpc`.

| Priority | Base URL | When |
| --- | --- | --- |
| 1 (default) | `https://api2.warera.io/trpc` | Normal operation |
| experiment | any other `WARERA_API_BASE_URL` | Local experiments only — not a supported dual-path |

Default `WARERA_API_BASE_URL` is `https://api2.warera.io/trpc`. Do not use undocumented hosts such as `api5` for public integrations.

## How to call

Most public procedures work with **GET** + optional `input` query JSON (OpenAPI may show POST; GET is preferred when it works):

```
GET {base}/{namespace}.{method}
GET {base}/{namespace}.{method}?input=<url-encoded JSON>
```

**Exception:** some auth-required procedures on api2 (notably `company.getRecommendedRegionIdsByItemCode`) require:

- **POST** to `https://api2.warera.io/trpc/{procedure}`
- Header **`X-API-Key`** (Bearer does **not** work for these)
- JSON body, e.g. `{ "itemCode": "lead", "count": 1 }`

Same pattern for `muMember.getByMu` (MU member stats poll): not on official OpenAPI; requires `X-API-Key`.

Same pattern for `work.getStatsByCompany` and `work.getStatsByWorkerAndCompany` (followed-entity work-stats poll): not on official OpenAPI; requires **api2** + `X-API-Key`. Prefer GET batch; fall back to POST JSON body when GET is rejected. See `src/warera/work-stats.ts`.

Examples:

```bash
# Official API (often public, no key)
curl -G 'https://api2.warera.io/trpc/country.getAllCountries'

# With input (GET)
curl -G 'https://api2.warera.io/trpc/user.getUserLite' \
  --data-urlencode 'input={"userId":"<id>"}'

# Recommended regions (api2 POST + X-API-Key)
curl -sS -X POST 'https://api2.warera.io/trpc/company.getRecommendedRegionIdsByItemCode' \
  -H 'X-API-Key: <api-key>' \
  -H 'Content-Type: application/json' \
  -d '{"itemCode":"lead","count":3}'
```

Response shape is typically tRPC: `{ "result": { "data": ... } }` (or `{ "error": ... }`).

## Auth

| Target | Header |
| --- | --- |
| `api2.warera.io` | `Authorization: Bearer <token>` by default; **some procedures require `X-API-Key` instead** (recommended regions, work-stats, item-market txs) |

Use `WARERA_API_KEY`. Never hardcode secrets.

`src/warera/client.ts`: `auto` = Bearer on api2; `authStyle: "api-key"` forces `X-API-Key`. No gateway-miss fallback.

## Rate limits & caching

- Soft local limiter: `WARERA_MAX_REQUESTS_PER_MINUTE` (default 120), one HTTP call per slot.
- api2 headers (observed): `ratelimit-limit` / `ratelimit-policy` (`500;w=60`) / `ratelimit-remaining` / `ratelimit-reset` (seconds). 429 pauses **all** in-flight sends until reset (`Retry-After` wins when present).
- tRPC HTTP batches: max **50** procedures per request; GET URL-length chunk 2000 remains. Background singles coalesce ~400ms.
- L1 freshness is our Turso tables / pack TTL — not a community gateway cache.

## Project client

Use / extend `src/warera/` (`createWareraClient` facade). Do not add a parallel HTTP stack.

Preferences:

1. Call only allowlisted procedures (see index below / OpenAPI).
2. Default base is api2 `/trpc`.
3. Log procedure, `call_class`, status, latency, outcome.
4. Retry GET and read-only `batch=1` POST on 5xx/network (max 3) and 429 (reset wait). Do not retry other 4xx.
5. For response field details, consult community docs; for “is this allowed?”, consult official OpenAPI.

## Endpoint index (allowlist snapshot)

Refresh from https://api2.warera.io/openapi.json when in doubt.

Official OpenAPI is **incomplete** relative to live api2. Community explorers such as https://warera.realmarijn.nl/api-explorer document additional read procedures that work with an API key. This project may call those when explicitly needed (document the override in code/design). Prefer official OpenAPI first.

| Namespace | Procedures |
| --- | --- |
| article | `getArticleById`, `getArticleLiteById`, `getArticlesPaginated` |
| battle | `getBattles`, `getById`, `getLiveBattleData` |
| battleLootSummary | `getByBattleAndUser` |
| battleOrder | `getByBattle` |
| battleRanking | `getRanking` |
| company | `getById`, `getCompanies`, `getProductionBonus`†, `getRecommendedRegionIdsByItemCode`† |
| country | `getAllCountries`, `getCountryById` |
| donation | `getManyPaginated`‡ |
| event | `getEventsPaginated` |
| gameConfig | `getDates`, `getGameConfig` |
| government | `getByCountryId` |
| inventory | `fetchCurrentEquipment` |
| itemOffer | `getById` |
| itemTrading | `getPrices` |
| mercenaryContractAuction | `getPaginatedAuctions` |
| mu | `getById`, `getManyPaginated` |
| muMember | `getByMu`†† |
| ranking | `getRanking` |
| region | `getById`, `getRegionsObject` |
| round | `getById`, `getLastHits` |
| search | `searchAnything` |
| tradingOrder | `getTopOrders` |
| transaction | `getPaginatedTransactions`††† |
| upgrade | `getUpgradeByTypeAndEntity` |
| user | `getUserById`, `getUserLite`, `getUsersByCountry` |
| work | `getStatsByCompany`§, `getStatsByWorkerAndCompany`§ |
| workOffer | `getById`, `getWorkOfferByCompanyId`, `getWorkOffersPaginated` |
| worker | `getTotalWorkersCount`, `getWorkers` |

† Auth-required; present on live api2 / explorers but not always on official OpenAPI. Used for Economy advisor (recommended regions / production bonus).

†† Not on official OpenAPI; live api2 read used by MU stats poll — call api2 directly.

§ Not on official OpenAPI; force **api2** + `X-API-Key` for followed-entity work-stats (daily company/worker production). Prefer GET tRPC batch; POST fallback with body `{"0":input0,"1":input1}` when GET is rejected.

††† On official OpenAPI; force **api2** + `authStyle: "api-key"` for item-market ingest — gateway has had DB failures on this procedure. Requires `WARERA_API_KEY`.

‡ Not on official OpenAPI; live api2 read used by donation poll — prefer GET, POST + `X-API-Key` fallback.

For parameters and schemas: official OpenAPI. For observed response shapes: community `spec.md` / `spec.json` under majimawrks/warera-api-docs.

## Agent checklist

When adding or changing WarEra API usage:

- [ ] Procedure appears in official OpenAPI / docs
- [ ] Base URL is api2 `/trpc` (not inventing hosts/paths)
- [ ] Correct auth header for the chosen host
- [ ] Goes through `src/warera` client + rate limit
