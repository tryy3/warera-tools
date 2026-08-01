# Economy Recent Players — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation  
**Depends on:** [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md)

## Goal

Remember recently viewed Economy players in the browser so returning users can reopen a player with one click, without retyping a search.

## Decisions

| Topic | Choice |
| --- | --- |
| Storage | `localStorage` only (no server, no sync) |
| Persist trigger | When the user selects a player (live search result or recent entry) |
| Identity | Dedupe by `userId`; store canonical `username` from the API result, not the typed query |
| Ordering | MRU — selected player moves to front |
| Cap | Keep last 5 entries; drop oldest |
| Remove / clear | None |
| UI placement | Compact “Recent” row under the username search input |

## Behavior

1. User types a query and clicks a live search result (or clicks a recent entry).
2. Page navigates with `userId` + canonical `username` (existing URL search params).
3. That `{ userId, username }` pair is remembered: if `userId` already exists, remove the old entry and insert at front with the latest canonical username; otherwise prepend.
4. Truncate the list to 5.
5. On next visit (or same session remount), the Recent row shows the stored usernames; clicking one loads that player the same way as a live result (navigate + remember + bump MRU).

Empty storage → Recent row is not rendered.

Corrupt, missing, or unreadable `localStorage` → treat as empty list (fail soft; do not surface an error).

## Data shape

Storage key: `economyRecentPlayers:v1`

```ts
type RecentEconomyPlayer = {
  userId: string;
  username: string;
};

// stored JSON: RecentEconomyPlayer[]
```

Versioned key so a future schema change can migrate or ignore `v1` without colliding.

## Architecture

### Helper — `src/web/lib/recentEconomyPlayers.ts`

Pure module (easy to unit test):

- `loadRecentEconomyPlayers(): RecentEconomyPlayer[]`
- `rememberEconomyPlayer(player: RecentEconomyPlayer): RecentEconomyPlayer[]` — dedupe by `userId`, MRU prepend, cap at 5, write through, return next list

Wrap `getItem` / `setItem` / `JSON.parse` in try/catch. Invalid entries (missing string fields) are filtered out on load.

### UI — `EconomyPage`

- Load recent list into state on mount.
- Shared select handler used by live results and recent buttons: navigate via `buildEconomySearch`, then `rememberEconomyPlayer` and update state.
- Under `#user-search`: muted “Recent” label + horizontal row of username buttons when the list is non-empty.
- Highlight the button matching the currently selected `userId`.
- Keep the Recent row visible while the user is typing (do not hide behind live results).

Minimal CSS under existing economy search styles — reuse `.economy-user` / active patterns where practical; avoid card chrome.

## Testing

Unit tests for the helper:

- Dedupe: selecting the same `userId` three times yields one entry
- Canonical name: remembering `{ userId, username: "tryy3" }` after a typed query does not store the typed casing
- MRU: re-selecting an older entry moves it to index 0
- Cap: sixth distinct player drops the oldest
- Bad JSON / non-array / missing fields → empty or filtered list without throw

No E2E required for this slice.

## Out of scope

- Per-entry remove or “Clear all”
- Cross-device / account sync
- Remembering typed queries that never resolve to a selection
- Server-side search history
