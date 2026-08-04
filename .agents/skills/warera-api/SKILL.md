---
name: warera-api
description: Use WarEra's allowed public tRPC API (api2 / gateway), endpoint allowlist, auth, rate limits, and project client preferences. Use when working with WarEra API calls, WARERA_API_*, src/warera/, tRPC procedures, gateway.warerastats.io, api2.warera.io, or when the user mentions the WarEra API, rate limits, or public vs in-game endpoints.
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

tRPC base path includes `/trpc`:

| Priority | Base URL | When |
| --- | --- | --- |
| 1 (prefer) | `https://gateway.warerastats.io/trpc` | Reads / cached public data; same procedures, caching + batching |
| 2 (fallback) | `https://api2.warera.io/trpc` | Gateway down, missing procedure on gateway, or write/auth needs that require official API |

Gateway overview: https://gateway.warerastats.io/

Default `WARERA_API_BASE_URL` is `https://gateway.warerastats.io/trpc`. Do not use undocumented hosts such as `api5` for public integrations.

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

Gateway does not currently expose that procedure — call api2 directly.

Same pattern for `muMember.getByMu` (MU member stats poll): not on official OpenAPI; force api2 GET via `baseUrl: "https://api2.warera.io/trpc"`.

Examples:

```bash
# Official API (often public, no key)
curl -G 'https://api2.warera.io/trpc/country.getAllCountries'

# With input (GET)
curl -G 'https://api2.warera.io/trpc/user.getUserLite' \
  --data-urlencode 'input={"userId":"<id>"}'

# Gateway (requires gateway API key)
curl -G 'https://gateway.warerastats.io/trpc/country.getAllCountries' \
  -H 'X-API-Key: <gateway-key>'

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
| `api2.warera.io` | Often `Authorization: Bearer <token>`; **some procedures require `X-API-Key` instead** (e.g. `company.getRecommendedRegionIdsByItemCode`) |
| `gateway.warerastats.io` | `X-API-Key: <gateway-key>` (required; missing → 401) |

Use env vars (`WARERA_API_KEY`). Never hardcode secrets.

`src/warera/client.ts` defaults: `X-API-Key` for gateway, Bearer for api2. Per-request `authStyle: "api-key"` forces `X-API-Key` (needed for the recommended-regions POST). Gateway misses (`unknown method`) fall back to api2 preserving method/body/authStyle.

## Rate limits & caching

- Prefer the **gateway** for repeated reads: caching, request dedup, ~400ms batching window, advertised ~200 req/min.
- Keep this app's soft limiter (`WARERA_MAX_REQUESTS_PER_MINUTE`, default 120) under upstream caps; wait rather than stampede into 429s.
- Gateway cache TTLs vary by procedure (often 2–10 min); some list endpoints are DB-backed on the gateway. Treat gateway data as slightly stale when freshness matters — fall back to api2 for live needs (e.g. battle live data).

## Project client

Use / extend `src/warera/` (`createWareraClient`, rate limiter, cache helpers). Do not add a parallel HTTP stack.

Preferences:

1. Call only allowlisted procedures (see index below / OpenAPI).
2. Prefer gateway base URL for cacheable GETs; fall back to api2.
3. Log path, status, latency (existing client behavior).
4. Retry only idempotent GETs on transient failures (existing client behavior).
5. For response field details, consult community docs; for “is this allowed?”, consult official OpenAPI.

## Endpoint index (allowlist snapshot)

Refresh from https://api2.warera.io/openapi.json when in doubt. Gateway may support a subset — if a procedure 404s on gateway, retry on api2.

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
| workOffer | `getById`, `getWorkOfferByCompanyId`, `getWorkOffersPaginated` |
| worker | `getTotalWorkersCount`, `getWorkers` |

† Auth-required; present on live api2 / explorers but not always on official OpenAPI. Used for Economy advisor (recommended regions / production bonus).

†† Not on official OpenAPI; live api2 read used by MU stats poll — call api2 directly.

††† On official OpenAPI; force **api2** + `authStyle: "api-key"` for item-market ingest — gateway has had DB failures on this procedure. Requires `WARERA_API_KEY`.

For parameters and schemas: official OpenAPI. For observed response shapes: community `spec.md` / `spec.json` under majimawrks/warera-api-docs.

## Agent checklist

When adding or changing WarEra API usage:

- [ ] Procedure appears in official OpenAPI / docs
- [ ] Base URL is gateway `/trpc` or api2 `/trpc` (not inventing hosts/paths)
- [ ] Correct auth header for the chosen host
- [ ] Goes through `src/warera` client + rate limit
- [ ] Stale-cache tradeoff considered if using gateway
