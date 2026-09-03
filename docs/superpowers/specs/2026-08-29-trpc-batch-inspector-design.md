# tRPC Batch Inspector — Design

**Date:** 2026-08-29  
**Status:** Approved for implementation  
**Depends on / extends:** none (client-only developer tool)

## Goal

Add a **developer/admin** tool that turns an in-game DevTools tRPC **batch** capture (URL + payload + response) into a scannable per-procedure overview, then exports a single-procedure **HTTPie** command aimed at **api2** so undocumented-but-official endpoints can be tried outside the game client.

## Decisions

| Topic | Choice |
| --- | --- |
| Scope | Parse + display + copy HTTPie only — **no** live api2 calls from the app |
| Inputs | Three paste fields: URL, Payload, Response (response optional) |
| Route / nav | `/trpc-batch`, shell tab **tRPC Batch** (same style as other tools) |
| Host rewrite | Export always uses `api2.warera.io`; pasted hosts (e.g. `api5`) only for parsing |
| Auth in export | `X-API-Key:$WARERA_API_KEY` (env; user sets key outside the app) |
| HTTPie shape | `https POST api2.warera.io/trpc/{procedure} X-API-Key:$WARERA_API_KEY …` form fields |
| Nested input | Prefer HTTPie nested / array form syntax (`owner[type]=mu`, `items[]=a`); JSON `:='…'` only when needed |
| Index join | URL procedure order is the index space; payload keys may be sparse; response array aligns by URL index |
| Persistence | Out of scope (no localStorage) |
| Allowlist check | Out of scope (no OpenAPI validation in v1) |
| Filter/search | Out of scope for v1 |

## Architecture

```
[paste URL + payload + response]
        |
        v
  parseBatchCapture()   (pure, unit-tested)
        |
        v
  rows: { index, procedure, input, response }[]
        |
        +--> list UI + detail JSON
        |
        +--> buildHttpieCommand(row) --> clipboard
```

No new server routes, jobs, or WarEra client calls. Feature lives under `src/web/features/trpc-batch/` with route `src/web/routes/trpc-batch.tsx`.

## Parse rules

### URL

1. Require a path containing `/trpc/`.
2. Take the segment after `/trpc/` (before `?`).
3. Split on `,` to get ordered procedure names (`namespace.method`).
4. Query string (`?batch=1`, etc.) is ignored for listing and for export (single-procedure path, no batch).

### Payload

- JSON object with string keys `"0"`, `"1"`, … (tRPC batch input bag).
- Keys may be **sparse** (e.g. missing `"8"` while URL still has a procedure at index 8).
- Per row: `input = payload[String(index)] ?? null`.

### Response

- Optional JSON **array**.
- `response[i]` pairs with URL procedure index `i` (dense array, not keyed by payload).
- Missing / shorter array → `response: null` for those rows; warn if lengths differ from procedure count.

### Row model

```ts
type BatchRow = {
  index: number;
  procedure: string;
  input: unknown | null; // null = no payload entry
  response: unknown | null; // null = missing / not pasted
};
```

## UI

**Top → bottom:**

1. **Paste panel** — labeled textareas: URL, Payload, Response. Re-parse on every change; invalid JSON shows an inline error and leaves prior good parse or empty inputs/responses as defined in Errors.
2. **Procedure list** — one row per index: `#`, procedure name, short input preview (key names), status. Status: `error` if response object has an `error` key; else `no input` / `no response` when those are missing; else `ok`. Click selects.
3. **Detail panel** — pretty-printed Input and Response for the selection; actions: **Copy HTTPie**, **Copy input JSON**, **Copy response JSON**.

Match existing Shell + shadcn dark war-command styling. No new visual system.

## HTTPie export

Example target shape:

```bash
https POST api2.warera.io/trpc/work.getStatsByCompany X-API-Key:$WARERA_API_KEY companyId=… days:=14 workerId=…
```

**Rules:**

| Input value | HTTPie form arg |
| --- | --- |
| string | `key=value` (shell-safe quoting when needed) |
| number / boolean | `key:=value` |
| `null` | skip field |
| nested object | flatten with brackets: `owner[type]=mu` |
| array of scalars | `items[]=a items[]=b` (or `:=` for numeric elements as needed) |
| deeply awkward / mixed | last resort `key:='<json>'` |

- Always rewrite host to `api2.warera.io`.
- Always single procedure path (never comma-batch).
- Missing input → command with URL + header only.
- Copy to clipboard only.

## Errors

| Condition | Behavior |
| --- | --- |
| Bad / non-tRPC URL | Inline error; empty list |
| Invalid payload JSON | Inline error; still list procedures from URL; inputs marked unavailable |
| Invalid response JSON | Inline error; inputs still shown |
| Response length ≠ procedure count | Warning banner; attach by index anyway |

## Testing

Vitest unit tests for pure helpers (no Playwright required for v1):

- Sample batch URL with many procedures + sparse payload keys + response array → correct row join (including missing payload index).
- Host rewrite `api5` → `api2` in HTTPie output.
- Scalar + nested object → preferred form-field encoding.
- Invalid JSON / length mismatch messaging inputs as needed by the helpers.

## Out of scope

- Executing requests from the UI
- Storing pastes or API keys in the app
- Checking official OpenAPI allowlist
- Browser extension / automatic DevTools capture
- Navbar restructuring (add one tab only; later reorganize with other pages)

## Success criteria

1. Pasting the documented sample URL + payload + response yields one list entry per procedure with matching input/response.
2. Selecting a row and copying HTTPie produces a runnable `https POST api2…` command using `$WARERA_API_KEY` and flat/nested form fields.
3. Tool is reachable from the shell nav as **tRPC Batch**.
