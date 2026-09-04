---
name: warera-api
description: Use WarEra's allowed public tRPC API (api2), endpoint allowlist, auth, rate limits, and project client preferences. Use when working with WarEra API calls, WARERA_API_*, src/warera/, tRPC procedures, api2.warera.io, or when the user mentions the WarEra API, rate limits, or public vs in-game endpoints.
---

# WarEra API

Game economy formulas (PP, companies, scrap tiers, tax) → [warera-game-mechanics](../warera-game-mechanics/SKILL.md).

Procedure catalog (source / auth / used-here) → [procedures.md](./procedures.md).

## Official surface (hard rule)

A procedure is **official** if it works on live `https://api2.warera.io/trpc`. Missing from `/docs` or `openapi.json` does **not** make it unofficial.

Do not use in-game-only hosts such as `api5` unless the user explicitly overrides for a private experiment.

### Source ranking

| Rank | Source | Use for |
| --- | --- | --- |
| 1 | Live `api2.warera.io` | Is this allowed? (it works → yes) |
| 2 | https://warera.realmarijn.nl/api-explorer | Params, examples, fuller list |
| 3 | https://github.com/WarEraProjects/TRPC | OpenAPI-mapped vs `src/CustomEndpoints` |
| 4 | https://api2.warera.io/docs/ / https://api2.warera.io/openapi.json | Incomplete snapshot |
| 5 | https://majimawrks.github.io/warera-api-docs/#/ | Observed response shapes only |

Never write “not official” or “OpenAPI override” for an api2 procedure. Say “not in OpenAPI (still official on api2)” when that is the fact.

## Base URLs (project preference)

tRPC base path includes `/trpc`.

| Priority | Base URL | When |
| --- | --- | --- |
| 1 (default) | `https://api2.warera.io/trpc` | Normal operation |
| experiment | any other `WARERA_API_BASE_URL` | Local experiments only — not a supported dual-path |

Default `WARERA_API_BASE_URL` is `https://api2.warera.io/trpc`.

## How to call

Most procedures work with **GET** + optional `input` query JSON (OpenAPI may show POST; GET is preferred when it works):

```
GET {base}/{namespace}.{method}
GET {base}/{namespace}.{method}?input=<url-encoded JSON>
```

**Exception:** some procedures (notably `company.getRecommendedRegionIdsByItemCode`) require:

- **POST** to `https://api2.warera.io/trpc/{procedure}`
- Header **`X-API-Key`** (Bearer does **not** work for these)
- JSON body, e.g. `{ "itemCode": "lead", "count": 1 }`

Same POST fallback pattern for `muMember.getByMu`, `donation.getManyPaginated`, and `work.getStatsByCompany` / `work.getStatsByWorkerAndCompany` when GET is rejected. See `src/warera/work-stats.ts`.

Examples:

```bash
# In-app we always send X-API-Key when WARERA_API_KEY is set.
# country.getAllCountries is optional-auth (works without a key in scripts).
curl -G 'https://api2.warera.io/trpc/country.getAllCountries' \
  -H 'X-API-Key: <api-key>'

curl -G 'https://api2.warera.io/trpc/user.getUserLite' \
  -H 'X-API-Key: <api-key>' \
  --data-urlencode 'input={"userId":"<id>"}'

curl -sS -X POST 'https://api2.warera.io/trpc/company.getRecommendedRegionIdsByItemCode' \
  -H 'X-API-Key: <api-key>' \
  -H 'Content-Type: application/json' \
  -d '{"itemCode":"lead","count":3}'
```

Response shape is typically tRPC: `{ "result": { "data": ... } }` (or `{ "error": ... }`).

## Auth

In this app, `src/warera/client.ts` `authStyle: "auto"` sends **`X-API-Key`** whenever `WARERA_API_KEY` is set. No header when the key is unset. Do not send Bearer and `X-API-Key` together.

`authStyle: "bearer"` is an explicit opt-out. Existing `authStyle: "api-key"` call sites are equivalent to the new default.

For one-off scripts outside this repo, see [procedures.md](./procedures.md) Auth column (`required` / `optional` / `unknown`). Prefer sending the key when unsure.

Never hardcode secrets.

## Rate limits & caching

- Soft local limiter: `WARERA_MAX_REQUESTS_PER_MINUTE` (default 120), one HTTP call per slot.
- api2 headers (observed): `ratelimit-limit` / `ratelimit-policy` (`500;w=60`) / `ratelimit-remaining` / `ratelimit-reset` (seconds). 429 pauses **all** in-flight sends until reset (`Retry-After` wins when present).
- tRPC HTTP batches: max **50** procedures per request; GET URL-length chunk 2000 remains. Background singles coalesce ~400ms.
- L1 freshness is our Turso tables / pack TTL.

## Project client

Use / extend `src/warera/` (`createWareraClient` facade). Do not add a parallel HTTP stack.

Preferences:

1. Call procedures that work on api2 (see [procedures.md](./procedures.md) / live api2 / realmarijn / TRPC).
2. Default base is api2 `/trpc`.
3. Log procedure, `call_class`, status, latency, outcome.
4. Retry GET and read-only `batch=1` POST on 5xx/network (max 3) and 429 (reset wait). Do not retry other 4xx.
5. For parameters/examples: realmarijn. For OpenAPI schemas when present: `/docs`. For “is this allowed?”: live api2.

Listing a procedure in the catalog does **not** mean this app should start calling it.

## Agent checklist

When adding or changing WarEra API usage:

- [ ] Procedure works on api2 (or is listed in [procedures.md](./procedures.md) / TRPC / realmarijn)
- [ ] Base URL is api2 `/trpc` (not inventing hosts/paths)
- [ ] Goes through `src/warera` client + rate limit
- [ ] Send `WARERA_API_KEY` as `X-API-Key` when we have one
- [ ] Update [procedures.md](./procedures.md) `Used here` / Auth if you learned something new
