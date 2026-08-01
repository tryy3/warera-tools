# Economy Player Combobox (shadcn) — Design

**Date:** 2026-08-01  
**Status:** Approved for implementation  
**Depends on:** [Economy Recent Players](./2026-08-01-economy-recent-players-design.md), [Company Economy Advisor](./2026-07-31-company-economy-advisor-design.md)

## Goal

Install latest shadcn/ui in this Vite app and replace the Economy “Find player” stacked search/Recent UI with a Combobox whose suggestions open in a popup overlay. Map shadcn theme tokens to the existing palette. Scope is this control only — not a full UI migration.

## Decisions

| Topic | Choice |
| --- | --- |
| Component | shadcn Combobox (not Command, not hand-rolled Popover) |
| Overlay | Combobox popup content above the page — not an inline block under Recent |
| Groups | **Recent** (localStorage) and **Results** (API search) inside the popup |
| Theme | Map shadcn CSS variables onto existing app tokens |
| Migration breadth | Economy find-player only; leave shell/cards/tables on legacy CSS |

## Install & theme

1. Run `pnpm dlx shadcn@latest init` against the existing Vite + React project (Tailwind v4 via `@tailwindcss/vite`, `components.json`, path aliases).
2. Add Combobox via `pnpm dlx shadcn@latest add combobox` (accept transitive UI deps the CLI pulls).
3. Map shadcn semantic tokens (`background`, `foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `accent`, `accent-foreground`, `popover`, `popover-foreground`, `primary`, etc.) to the current dark warm palette (`--bg`, `--text`, `--muted`, `--border`, `--raised`, `--panel`, `--accent`, …).
4. Keep existing `src/web/index.css` rules for non-migrated surfaces. Tailwind/shadcn styles apply to new components; no global restyle of shell, nav, or company cards in this slice.

Preserve `@` alias resolution already used by the web app; adjust `vite.config.ts` / tsconfig only as required by shadcn init.

## Player finder UX

Replace:

- Text input
- Separate Recent row under the input
- Separate live result list under that

With a single Combobox in the Economy search section:

| Behavior | Detail |
| --- | --- |
| Trigger | Focus / type in `ComboboxInput` opens `ComboboxContent` as a floating overlay |
| Recent group | Items from `loadRecentEconomyPlayers()`; omit group when empty |
| Results group | Debounced (~300ms) `GET /api/economy/search?q=…` when query length ≥ 2; show empty/loading/no-match via Combobox empty states |
| Select | Use canonical `userId` + `username` from the chosen item; navigate via existing `buildEconomySearch`; call `rememberEconomyPlayer`; clear input and close popup |
| Deduping display | Same player must not appear as both a page-level Recent chip and a live result list — both live inside the overlay groups only. Optionally omit a Recent entry from Results (or vice versa) if both would list the same `userId` in one open popup |

Persistence rules from the Recent Players design are unchanged (MRU, dedupe by `userId`, max 5, canonical username, no remove/clear UI).

## Architecture

| Piece | Responsibility |
| --- | --- |
| shadcn UI under `src/web/components/ui/` (or CLI default path) | Generated Combobox primitives |
| Theme / CSS entry | Tailwind + mapped CSS variables coexisting with legacy `index.css` |
| `recentEconomyPlayers.ts` | Unchanged storage helper |
| `EconomyPage` (or small extracted `PlayerCombobox`) | Wire Combobox groups, async search, select → navigate + remember |

Prefer a small extracted `PlayerCombobox` (or `EconomyPlayerSearch`) if `EconomyPage` would otherwise grow messy; keep advisor/company UI untouched.

## Testing

- Keep existing `recentEconomyPlayers` unit tests.
- Manual smoke: open Combobox → Recent visible when stored; type query → Results in popup; select → companies load, Recent updates, no duplicate stacked lists; reload → Recent persists.
- `vp check` / `vp test` must pass after Tailwind/shadcn wiring.

No new E2E required for this slice.

## Out of scope

- Migrating Button, Card, Table, shell nav, or other pages to shadcn
- Command palette / global search
- Removing legacy CSS globally
- Changing advisor API or economy math
- Per-entry remove / clear-all for Recent
