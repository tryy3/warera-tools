# WarEra API official surface — Design

**Date:** 2026-09-04  
**Status:** Approved for implementation  
**Depends on / extends:**

- [`.agents/skills/warera-api/SKILL.md`](../../../.agents/skills/warera-api/SKILL.md) (rewrite)
- [Access facade](./2026-08-22-warera-access-facade-design.md) (auth default supersedes Bearer-on-api2)
- [Living API docs](../../warera-api/README.md)

## Goal

Stop treating [api2 `/docs`](https://api2.warera.io/docs/) / [openapi.json](https://api2.warera.io/openapi.json) as the public allowlist. **Official = works on live `api2.warera.io`**. Align the warera-api skill, a fuller procedure catalog, living docs, and the in-process client’s default auth with that rule.

This pass does **not** add new WarEra procedure calls just because they appear in the catalog.

## Decisions

| Topic | Choice |
| --- | --- |
| Official | Procedure works on `https://api2.warera.io/trpc` |
| `/docs` / OpenAPI | Incomplete snapshot — never the allowlist |
| In-game hosts | `api5` and similar stay out of bounds unless the user explicitly overrides |
| Skill | Rulebook: host, call shape, auth default, discovery order, checklist |
| Catalog | `.agents/skills/warera-api/procedures.md` — fuller api2 surface (~75), not only what we call |
| In-app auth | `auto` + `WARERA_API_KEY` → always `X-API-Key` |
| Catalog auth notes | `required` / `optional` / `unknown` — fill only when we have evidence |
| Historical specs/plans | Leave as snapshots |
| `@wareraprojects/api` | Do not adopt as a dependency |

## Official surface

A procedure is official if it works on `https://api2.warera.io/trpc`. Missing from `/docs` or OpenAPI does **not** make it unofficial. Label those “not in OpenAPI (still official on api2)”, never “not official” or “OpenAPI override.”

In-game-only hosts (`api5` and similar) remain forbidden unless the user explicitly overrides for a private experiment.

### Source ranking (for agents)

| Rank | Source | Use for |
| --- | --- | --- |
| 1 | Live `api2.warera.io` | Is this allowed? (it works → yes) |
| 2 | [realmarijn API explorer](https://warera.realmarijn.nl/api-explorer) | Params, examples, fuller procedure list |
| 3 | [WarEraProjects/TRPC](https://github.com/WarEraProjects/TRPC) | OpenAPI-mapped vs `src/CustomEndpoints` |
| 4 | [api2 `/docs`](https://api2.warera.io/docs/) / [openapi.json](https://api2.warera.io/openapi.json) | Incomplete snapshot |
| 5 | majimawrks community specs | Observed response shapes only |

### Language to remove

- “Not official,” “unofficial,” “OpenAPI override,” “undocumented so we shouldn’t call it”
- Agent checklist item “procedure appears in official OpenAPI / docs”

Replace with: works on api2; “not in OpenAPI” when that is the fact; “auth required” only when known.

## Skill and catalog

### `SKILL.md`

Keep: tRPC base URL, GET vs POST call shape, rate limits, “use `src/warera`”, agent checklist.

Rewrite the hard rule to the official-surface policy above. Point discovery at realmarijn / TRPC / live api2. Auth: in this app, send `X-API-Key` whenever `WARERA_API_KEY` is set; for one-off scripts, see catalog auth notes.

Checklist:

- [ ] Procedure works on api2 (or is listed in the catalog / TRPC / realmarijn)
- [ ] Base URL is api2 `/trpc` (not inventing hosts/paths)
- [ ] Goes through `src/warera` client + rate limit
- [ ] Send `WARERA_API_KEY` as `X-API-Key` when we have one

Move the current inline endpoint table out of the skill into `procedures.md`. Keep a one-line pointer.

### `procedures.md`

Manual snapshot of the fuller api2 surface from realmarijn (~75 procedures), not only helpers this repo already calls.

Columns (per procedure, grouped by namespace):

| Column | Meaning |
| --- | --- |
| Procedure | e.g. `muMember.getByMu` |
| Docs source | `openapi` · `trpc-custom` · `explorer` |
| Auth | `required` · `optional` · `unknown` |
| Used here | `yes` (helper or job) or `no` |

**Docs source**

- `openapi` — listed on live OpenAPI
- `trpc-custom` — in [WarEraProjects/TRPC `CustomEndpoints`](https://github.com/WarEraProjects/TRPC/tree/main/src/CustomEndpoints) (official, not in OpenAPI). Namespaces there today: alliance, company (production bonus / recommended regions), donation, election, gameStat, muMember, party, tradingOrder (`getPublicOrdersByOwner`), work, workOffer (`getWageStats`), tournament
- `explorer` — on realmarijn but neither of the above

When a procedure appears in more than one, prefer `openapi` then `trpc-custom` then `explorer`.

**Auth notes** — evidence only, no guessing. Explorer “POST” labels are not evidence. Seed:

- `required` when this repo already forces `X-API-Key` (`authStyle: "api-key"` today): recommended regions, MU members, work-stats, item-market txs, donations. Do not mark `company.getProductionBonus` required unless we have that evidence.
- `optional` when we have confirmed a call works with no auth header (e.g. `country.getAllCountries`)
- otherwise `unknown` — in-app we still send the key

**Used here** from `src/warera/` helpers and the [inventory](../../warera-api/inventory.md). Unused rows stay; they are the point of the fuller index.

Refresh when we add or change API usage, or when realmarijn/TRPC clearly grew. No generator or CI sync in this pass.

## Auth (client)

`authHeaders` today: `auto` on api2 → `Authorization: Bearer`; `auto` on gateway → `X-API-Key`; `api-key` → `X-API-Key`. Bearer fails on several official procedures.

**Change:** `authStyle: "auto"` sends `X-API-Key` whenever `WARERA_API_KEY` is set, regardless of base URL. No auth header when the key is unset. Do not send both headers.

- `authStyle: "bearer"` remains an explicit opt-out.
- Existing `authStyle: "api-key"` call sites stay; they match the new default. No cleanup sweep.

This supersedes the access-facade spec’s “`auto` = Bearer on api2.”

## Living docs and comments

Update (same pass):

- README WarEra API section
- `docs/warera-api/README.md` (skill is no longer an OpenAPI allowlist)
- AGENTS.md one-liner for `src/warera/` (drop “allowlist + gateway prefs” wording)
- Comments in `src/warera` (`mu.ts`, `work-stats.ts`, `companies.ts`, donations, and any “not on official OpenAPI” / “undocumented”) → “not in OpenAPI; still official on api2; client sends `X-API-Key` by default”

Do **not** rewrite historical specs or plans.

## Tests

- Flip client tests that expect Bearer on api2 + key to expect `X-API-Key` and no `Authorization`.
- Keep a test that `authStyle: "bearer"` still sends Bearer.
- Gateway-URL “auto sends X-API-Key” remains true; drop or reword if it only existed to contrast with Bearer-on-api2.
- Scan other `src/warera/*.test.ts` auth-style assertions; change only those that encode the old Bearer default.

Verification: `vp test src/warera/client.test.ts` plus any other test files touched.

## Out of scope

- Adopting `@wareraprojects/api`
- Calling new procedures only because they appear in the catalog
- Using `api5` or inventing hosts
- Generating `procedures.md` from OpenAPI/TRPC/realmarijn
- Rewriting historical specs/plans
- Sending Bearer and `X-API-Key` together

## Success

Agents reading the skill treat live api2 as official, look up new endpoints on realmarijn/TRPC, and do not skip a procedure because it is missing from `/docs`. The in-process client sends `X-API-Key` by default when a key is configured. The catalog lists the fuller surface with honest auth/source tags.
