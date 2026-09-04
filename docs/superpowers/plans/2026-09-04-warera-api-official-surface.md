# WarEra API official surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treat live `api2.warera.io` as official, document the fuller procedure surface, and send `X-API-Key` by default when `WARERA_API_KEY` is set.

**Architecture:** Rewrite the warera-api skill as the rulebook; put the ~75-procedure catalog in `procedures.md` (realmarijn + TRPC CustomEndpoints + OpenAPI tags). Change `authHeaders` so `auto` always sends `X-API-Key`. Update living docs and comments that still say OpenAPI is the allowlist. Do not call new procedures in this pass.

**Tech Stack:** TypeScript, Vitest via `vp test`, Vite+ (`vp check`).

**Design:** [2026-09-04-warera-api-official-surface-design.md](../specs/2026-09-04-warera-api-official-surface-design.md)

## Global Constraints

- Official = procedure works on `https://api2.warera.io/trpc`
- `/docs` / OpenAPI are an incomplete snapshot — never the allowlist
- `api5` and similar in-game hosts stay out of bounds unless the user explicitly overrides
- In-app auth: `auto` + `WARERA_API_KEY` → always `X-API-Key`; do not send both headers
- `authStyle: "bearer"` remains an explicit opt-out; existing `authStyle: "api-key"` call sites stay
- Catalog auth is `required` / `optional` / `unknown` — fill only with evidence from this repo
- Do not add new WarEra procedure calls just because they appear in the catalog
- Do not adopt `@wareraprojects/api`
- Do not rewrite historical specs or plans
- Prefer `vp test path/to/file.test.ts` while iterating; `vp check` before considering a task done
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/warera/client.ts` | `auto` sends `X-API-Key` whenever a key is set |
| `src/warera/client.test.ts` | api2 default is `X-API-Key`; bearer opt-out still sends Bearer |
| `.agents/skills/warera-api/SKILL.md` | Official-surface rulebook |
| `.agents/skills/warera-api/procedures.md` | Fuller api2 catalog (source / auth / used-here) |
| `README.md` | WarEra API section |
| `docs/warera-api/README.md` | Skill is not an OpenAPI allowlist |
| `AGENTS.md` | `src/warera/` one-liner |
| `src/warera/mu.ts`, `work-stats.ts`, `companies.ts` | Comments: not in OpenAPI, still official |

---

### Task 1: Default `X-API-Key` on api2

**Files:**
- Modify: `src/warera/client.test.ts:109-151`
- Modify: `src/warera/client.ts:37-60`

**Interfaces:**
- Consumes: `WareraAuthStyle = "auto" | "api-key" | "bearer"`; `authHeaders(baseUrl, apiKey, authStyle)`
- Produces: `auto` + key → `X-API-Key` on any base URL; `bearer` + key → `Authorization: Bearer`

- [ ] **Step 1: Rewrite the api2 auth test and add a bearer opt-out test**

In `src/warera/client.test.ts`, replace the test `"sends Bearer Authorization when using the official api2 base URL"` (starts ~line 131) with these two tests. Keep `"sends X-API-Key when using the gateway base URL"` unchanged.

```ts
  it("sends X-API-Key when using the official api2 base URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: {
        ...baseConfig,
        wareraApiBaseUrl: "https://api2.warera.io/trpc",
      },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await client.request("/country.getAllCountries");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("X-API-Key")).toBe("test-key");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("sends Bearer Authorization when authStyle is bearer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = createWareraClient({
      config: {
        ...baseConfig,
        wareraApiBaseUrl: "https://api2.warera.io/trpc",
      },
      logger: testLogger(),
      fetchImpl: fetchMock,
      sleep: async () => {},
    });

    await client.request("/country.getAllCountries", { authStyle: "bearer" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-key");
    expect(headers.get("X-API-Key")).toBeNull();
  });
```

- [ ] **Step 2: Run the two tests and confirm the api2 default fails**

Run: `vp test src/warera/client.test.ts`

Expected: `"sends X-API-Key when using the official api2 base URL"` FAIL (still sends Bearer). `"sends Bearer Authorization when authStyle is bearer"` PASS (same as today's `auto` on api2). Gateway test still PASS.

- [ ] **Step 3: Change `authHeaders` so `auto` always uses `X-API-Key`**

In `src/warera/client.ts`, replace the `WareraRequestInit.authStyle` JSDoc and `authHeaders`:

```ts
  /**
   * Auth header style. `auto` = `X-API-Key` when `WARERA_API_KEY` is set.
   * Use `bearer` only as an explicit opt-out. `api-key` is the same header as `auto`.
   */
  authStyle?: WareraAuthStyle;
```

```ts
function authHeaders(
  _baseUrl: string,
  apiKey: string | undefined,
  authStyle: WareraAuthStyle = "auto",
): Headers {
  const headers = new Headers();
  if (!apiKey) return headers;
  if (authStyle === "bearer") {
    headers.set("Authorization", `Bearer ${apiKey}`);
    return headers;
  }
  headers.set("X-API-Key", apiKey);
  return headers;
}
```

Keep the `authHeaders(baseUrl, …)` call sites as they are. If oxlint rejects `_baseUrl`, keep the name `baseUrl` and void it with `void baseUrl;` as the first line of the function.

- [ ] **Step 4: Re-run client tests**

Run: `vp test src/warera/client.test.ts`

Expected: PASS, including gateway auto, api2 auto → `X-API-Key`, and `authStyle: "bearer"` → Bearer.

- [ ] **Step 5: Commit**

```bash
git add src/warera/client.ts src/warera/client.test.ts
git commit -m "$(cat <<'EOF'
fix(warera): send X-API-Key by default when an API key is set

Bearer on api2 fails for several official procedures; keep bearer as an explicit opt-out.
EOF
)"
```

---

### Task 2: Skill rulebook + procedure catalog

**Files:**
- Modify: `.agents/skills/warera-api/SKILL.md` (replace contents)
- Create: `.agents/skills/warera-api/procedures.md`

**Interfaces:**
- Consumes: OpenAPI snapshot (40 procedures), [WarEraProjects/TRPC CustomEndpoints](https://github.com/WarEraProjects/TRPC/tree/main/src/CustomEndpoints), realmarijn explorer (~75), used-here from `src/warera/`
- Produces: skill points at `procedures.md`; catalog columns `Docs source` / `Auth` / `Used here`

- [ ] **Step 1: Replace `.agents/skills/warera-api/SKILL.md` with this file**

Keep the existing YAML `name` / `description`. Body:

```markdown
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
```

- [ ] **Step 2: Create `.agents/skills/warera-api/procedures.md` with this catalog**

Snapshot date: 2026-09-04. Docs source: `openapi` if on live OpenAPI (40 procedures); else `trpc-custom` if in WarEraProjects/TRPC `CustomEndpoints`; else `explorer`. Auth: `required` only where this repo already forces `authStyle: "api-key"`; `optional` only for `country.getAllCountries`; otherwise `unknown`. Used here: `yes` only for helpers in `src/warera/` that call the procedure.

Includes two TRPC-custom procedures not on realmarijn: `alliance.getByIds`, `gameStat.getEquipmentAvgByCode`.

```markdown
# WarEra api2 procedures

Manual snapshot for agents. **Official = works on `https://api2.warera.io/trpc`.** Refresh when we add/change API usage or realmarijn/TRPC clearly grew. No generator.

| Column | Meaning |
| --- | --- |
| Docs source | `openapi` · `trpc-custom` · `explorer` (prefer openapi > trpc-custom > explorer) |
| Auth | `required` · `optional` · `unknown` — evidence only; in-app we still send `X-API-Key` when set |
| Used here | `yes` if `src/warera/` calls it |

Params/examples: https://warera.realmarijn.nl/api-explorer  
Custom vs OpenAPI: https://github.com/WarEraProjects/TRPC/tree/main/src/CustomEndpoints

## Catalog

| Procedure | Docs source | Auth | Used here |
| --- | --- | --- | --- |
| alliance.getById | trpc-custom | unknown | no |
| alliance.getByIds | trpc-custom | unknown | no |
| alliance.getManyPaginated | trpc-custom | unknown | no |
| article.getArticleById | openapi | unknown | no |
| article.getArticleLiteById | openapi | unknown | no |
| article.getArticlesPaginated | openapi | unknown | no |
| article.getWelcomeArticleByCountryId | explorer | unknown | no |
| battle.getBattles | openapi | unknown | yes |
| battle.getById | openapi | unknown | yes |
| battle.getLiveBattleData | openapi | unknown | no |
| battleLootSummary.getByBattleAndUser | openapi | unknown | yes |
| battleOrder.getByBattle | openapi | unknown | no |
| battleRanking.getRanking | openapi | unknown | no |
| company.getById | openapi | unknown | yes |
| company.getCompanies | openapi | unknown | yes |
| company.getProductionBonus | trpc-custom | unknown | yes |
| company.getRecommendedRegionIdsByItemCode | trpc-custom | required | yes |
| country.getAllCountries | openapi | optional | yes |
| country.getCountryById | openapi | unknown | no |
| country.getUnrestData | explorer | unknown | no |
| countryDiplomacy.getByCountry | explorer | unknown | no |
| donation.getManyPaginated | trpc-custom | required | yes |
| donation.getTotalDonations | trpc-custom | unknown | no |
| election.getElection | explorer | unknown | no |
| election.getElections | trpc-custom | unknown | no |
| event.getEventsPaginated | openapi | unknown | no |
| gameConfig.getDates | openapi | unknown | no |
| gameConfig.getGameConfig | openapi | unknown | no |
| gameStat.getEquipmentAvgByCode | trpc-custom | unknown | no |
| gameStat.getWorldDevelopment | explorer | unknown | no |
| giveaway.getManyPaginated | explorer | unknown | no |
| government.getByCountryId | openapi | unknown | no |
| inventory.fetchCurrentEquipment | openapi | unknown | no |
| itemOffer.getById | openapi | unknown | no |
| itemTrading.getPrices | openapi | unknown | yes |
| mercenaryContractAuction.getPaginatedAuctions | openapi | unknown | no |
| mu.getById | openapi | unknown | yes |
| mu.getManyPaginated | openapi | unknown | no |
| muMember.getByMu | trpc-custom | required | yes |
| party.getById | trpc-custom | unknown | no |
| party.getManyPaginated | trpc-custom | unknown | no |
| ranking.getRanking | openapi | unknown | no |
| region.getAll | explorer | unknown | no |
| region.getById | openapi | unknown | yes |
| region.getRegionsObject | openapi | unknown | no |
| round.getById | openapi | unknown | no |
| round.getLastHits | openapi | unknown | no |
| sanction.getPaginated | explorer | unknown | no |
| search.searchAnything | openapi | unknown | yes |
| search.searchMus | explorer | unknown | no |
| search.searchUsers | explorer | unknown | no |
| shop.getLastGifts | explorer | unknown | no |
| shop.getSubscribedUsers | explorer | unknown | no |
| shop.getTopGiftGivers | explorer | unknown | no |
| tournament.getById | explorer | unknown | no |
| tournament.getLastTournament | trpc-custom | unknown | no |
| tournament.getManyPaginated | explorer | unknown | no |
| tournamentTeam.getById | trpc-custom | unknown | no |
| tournamentTeam.getByTournamentId | trpc-custom | unknown | no |
| tradingOrder.getPublicOrdersByOwner | trpc-custom | unknown | no |
| tradingOrder.getTopOrders | openapi | unknown | yes |
| transaction.getPaginatedTransactions | openapi | required | yes |
| upgrade.getUpgradeByTypeAndEntity | openapi | unknown | no |
| user.getUserById | openapi | unknown | yes |
| user.getUserLite | openapi | unknown | yes |
| user.getUsersByCountry | openapi | unknown | no |
| war.getById | explorer | unknown | no |
| work.getStatsByCompany | trpc-custom | required | yes |
| work.getStatsByUserId | trpc-custom | unknown | no |
| work.getStatsByWorker | explorer | unknown | no |
| work.getStatsByWorkerAndCompany | trpc-custom | required | yes |
| workOffer.getById | openapi | unknown | no |
| workOffer.getWageStats | trpc-custom | unknown | no |
| workOffer.getWorkOfferByCompanyId | openapi | unknown | yes |
| workOffer.getWorkOffersPaginated | openapi | unknown | no |
| worker.getTotalWorkersCount | openapi | unknown | no |
| worker.getWorkers | openapi | unknown | yes |
```

- [ ] **Step 3: Grep the skill for old allowlist language**

Run:

```bash
rg -n -i 'only endpoints exposed there|openapi override|not official|procedure appears in official OpenAPI' .agents/skills/warera-api/
```

Expected: no matches (Auth `optional` / “not in OpenAPI” in the skill body is fine; the phrases above must be gone).

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/warera-api/SKILL.md .agents/skills/warera-api/procedures.md
git commit -m "$(cat <<'EOF'
docs(skill): treat live api2 as official and catalog the fuller surface

OpenAPI is an incomplete snapshot; realmarijn and WarEraProjects/TRPC document procedures we already call.
EOF
)"
```

---

### Task 3: Living docs and code comments

**Files:**
- Modify: `README.md:89-100`
- Modify: `docs/warera-api/README.md:22`
- Modify: `AGENTS.md:54`
- Modify: `src/warera/mu.ts:235-238`
- Modify: `src/warera/work-stats.ts:88-114`
- Modify: `src/warera/companies.ts:294`

**Interfaces:**
- Consumes: Task 1 auth default; Task 2 skill/catalog
- Produces: living docs and comments that match the official-surface policy

- [ ] **Step 1: Replace the README WarEra API section**

In `README.md`, replace the `## WarEra API` section with:

```markdown
## WarEra API

Official public surface is live `api2.warera.io` (not in-game hosts such as `api5`):

- Live API: `https://api2.warera.io/trpc` (`WARERA_API_BASE_URL`)
- `/docs` and OpenAPI are an incomplete snapshot, not the allowlist
- Fuller catalog: https://warera.realmarijn.nl/api-explorer · OpenAPI vs custom: https://github.com/WarEraProjects/TRPC
- Auth: `X-API-Key` whenever `WARERA_API_KEY` is set (`Authorization: Bearer` is an explicit opt-out)
- In-process facade: local RPM + header-aware 429 pause, tRPC batch (max 50), in-flight dedup
- Response-shape notes: https://majimawrks.github.io/warera-api-docs/#/

Agent notes: [`.agents/skills/warera-api/SKILL.md`](.agents/skills/warera-api/SKILL.md) · catalog: [`.agents/skills/warera-api/procedures.md`](.agents/skills/warera-api/procedures.md).
```

- [ ] **Step 2: Fix `docs/warera-api/README.md` and `AGENTS.md` one-liners**

In `docs/warera-api/README.md`, change the skill row from:

`Allowlist, auth, gateway/api2 call preferences`

to:

`Official surface (live api2), auth, procedure catalog`

In `AGENTS.md` architecture table, change:

`| WarEra client | `src/warera/` — allowlist + gateway prefs: `.agents/skills/warera-api/` |`

to:

`| WarEra client | `src/warera/` — api2 client + catalog: `.agents/skills/warera-api/` |`

- [ ] **Step 3: Fix comments in `src/warera`**

`src/warera/mu.ts` JSDoc on `fetchMuMembersByMu`:

```ts
/**
 * Live api2 procedure; not in OpenAPI (still official on api2). Same class as
 * company.getRecommendedRegionIdsByItemCode. Client sends X-API-Key by default;
 * prefer GET, fall back to POST when GET is rejected.
 */
```

`src/warera/work-stats.ts` — the two comments on `requestWorkStatsBatch` / `fetchWorkStatsBatch`:

```ts
/**
 * Prefer GET batch; fall back to POST JSON when GET is rejected (these
 * procedures are not in OpenAPI and may require POST on api2).
 */
```

```ts
/**
 * Batch-fetch daily work stats via GET (POST fallback) + X-API-Key.
 *
 * Procedures `work.getStatsByCompany` and `work.getStatsByWorkerAndCompany`
 * are not in OpenAPI (still official on api2); they require `X-API-Key`
 * (same class as `company.getRecommendedRegionIdsByItemCode`).
 *
 * The batch layer (`requestBatch` + `parseTrpcBatchResponse`) unwraps each
 * slot's `result.data` to the day array; the parsers therefore receive the
 * array directly. Per-slot failures map to `null`; a whole-batch failure maps
 * every slot to `null` and is logged when a logger is provided.
 *
 * Worker map keys are `${companyId}\t${workerId}`.
 */
```

`src/warera/companies.ts` above `fetchBestRecommendedRegion`:

```ts
  // Not in OpenAPI (still official on api2); requires POST + X-API-Key + JSON body
  // (Bearer does not work). Client auto also sends X-API-Key when a key is set.
```

- [ ] **Step 4: Grep living files for leftover allowlist language**

Run:

```bash
rg -n -i 'openapi override|not official|undocumented procedure|prefer procedures listed in the official docs' \
  README.md AGENTS.md docs/warera-api/README.md \
  src/warera/mu.ts src/warera/work-stats.ts src/warera/companies.ts
```

Expected: no matches.

- [ ] **Step 5: `vp check` and commit**

Run: `vp check`

Expected: PASS.

```bash
git add README.md docs/warera-api/README.md AGENTS.md \
  src/warera/mu.ts src/warera/work-stats.ts src/warera/companies.ts
git commit -m "$(cat <<'EOF'
docs: align README and comments with live-api2 official surface

Stop calling OpenAPI the allowlist; note X-API-Key as the in-app default.
EOF
)"
```

---

## Self-review

- Spec official-surface policy → Task 2 skill
- Spec `procedures.md` catalog → Task 2 file (realmarijn + TRPC extras, evidence-only auth)
- Spec client `auto` → `X-API-Key` + bearer opt-out → Task 1
- Spec living docs + comments → Task 3
- Spec out of scope (no new procedure calls, no `@wareraprojects/api`, no historical spec rewrites, no generator) → no tasks
- No TBD/TODO placeholders; tests and file bodies are complete
