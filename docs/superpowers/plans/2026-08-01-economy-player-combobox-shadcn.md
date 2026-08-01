# Economy Player Combobox (shadcn) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install latest shadcn/ui (Tailwind v4) and replace Economy “Find player” with a Combobox popup that groups Recent + API Results, themed to the existing palette.

**Architecture:** Bootstrap Tailwind + shadcn into the existing Vite+ React app without restyling the whole UI. Add Combobox primitives under `src/web/components/ui`. Extract `EconomyPlayerSearch` that owns async search, Recent group, and select → navigate/remember. `EconomyPage` only hosts the new control.

**Tech Stack:** React 19, Vite+/Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (Base UI Combobox), existing `recentEconomyPlayers` + economy search API.

**Design:** [2026-08-01-economy-player-combobox-shadcn-design.md](../specs/2026-08-01-economy-player-combobox-shadcn-design.md)

## Global Constraints

- Combobox only — not Command / hand-rolled Popover list
- Popup overlay for suggestions — no stacked Recent row + result list under the input
- Groups: **Recent** (localStorage) and **Results** (API); omit Recent when empty
- Map shadcn CSS variables onto existing `--bg` / `--text` / `--muted` / `--border` / `--raised` / `--panel` / `--accent`
- Do not migrate shell, cards, tables, or other pages
- Keep `recentEconomyPlayers` behavior (MRU, dedupe by `userId`, max 5, canonical username)
- Async search: debounce ~300ms, min query length 2, `filter={null}` on Combobox (server filters)
- Use project runner: prefer `pnpm` when available; otherwise `corepack pnpm` / Nix shell. Local `./node_modules/.bin/vp` for check/test
- Commit after each task
- Include the uncommitted clear-on-select intent by clearing Combobox input after select (no leftover live list)

## File Structure

| Path | Responsibility |
| --- | --- |
| `vite.config.ts` | Add `@tailwindcss/vite` plugin (keep `vite-plus` `defineConfig`) |
| `tsconfig.app.json` / `tsconfig.json` | Ensure `@/*` → `./src/*` (already present); add `baseUrl` if CLI requires |
| `components.json` | shadcn config; aliases under `src/web` |
| `src/web/index.css` | `@import "tailwindcss"` + shadcn theme vars mapped to app palette; keep legacy rules |
| `src/web/lib/utils.ts` | `cn()` helper (`clsx` + `tailwind-merge`) |
| `src/web/components/ui/*` | Generated Combobox (+ deps CLI adds) |
| `src/web/features/economy/EconomyPlayerSearch.tsx` | Combobox wiring |
| `src/web/features/economy/EconomyPage.tsx` | Swap search section for `EconomyPlayerSearch` |
| `src/web/index.css` (cleanup) | Remove unused `.economy-recent*` / `.economy-user*` if nothing else uses them |

---

### Task 1: Tailwind + shadcn init + theme mapping

**Files:**
- Modify: `package.json` / lockfile (via installers)
- Modify: `vite.config.ts`
- Modify: `src/web/index.css`
- Create: `components.json` (via CLI)
- Create: `src/web/lib/utils.ts` (via CLI or manual)
- Possibly modify: `tsconfig.app.json`, `tsconfig.json`

**Interfaces:**
- Consumes: existing CSS variables in `:root`
- Produces: working Tailwind + shadcn project config; `cn` at `@/web/lib/utils`

- [ ] **Step 1: Install Tailwind v4**

From repo root (use Nix/dev shell if `pnpm` is missing):

```bash
pnpm add tailwindcss @tailwindcss/vite
pnpm add clsx tailwind-merge class-variance-authority lucide-react
```

- [ ] **Step 2: Add Tailwind plugin to Vite+ config**

In `vite.config.ts`, import and register the plugin **inside** the existing `lazyPlugins` / plugins array (do not switch off `vite-plus`):

```ts
import tailwindcss from "@tailwindcss/vite";

// inside plugins: lazyPlugins(() => [
//   tanstackRouter(...),
//   react(),
//   tailwindcss(),
// ]),
```

Keep existing `@` alias → `path.resolve(__dirname, "src")`.

- [ ] **Step 3: Prepend Tailwind import to CSS (do not delete legacy rules)**

At the **top** of `src/web/index.css`, add:

```css
@import "tailwindcss";
```

Leave the existing `:root { … }` and all legacy class rules in place for now.

- [ ] **Step 4: Init shadcn (non-interactive where possible)**

```bash
pnpm dlx shadcn@latest init --yes
```

If the CLI prompts, choose:

- Style / base: defaults are fine
- CSS file: `src/web/index.css`
- Components alias path under web: configure so UI lands in `src/web/components/ui`
- Utils: `src/web/lib/utils.ts`

If `init` writes components to `src/components/ui` by default, either:

1. Set `components.json` aliases to `@/web/components` and `@/web/lib/utils`, then re-add, **or**
2. Move generated files to `src/web/components/ui` and `src/web/lib/utils.ts` and fix `components.json` accordingly.

Target import path for later tasks:

```ts
import { cn } from "@/web/lib/utils";
```

- [ ] **Step 5: Map shadcn theme tokens to the app palette**

After init, `src/web/index.css` will contain a `@theme` / CSS variable block for shadcn. Map semantic tokens to the existing palette (oklch or hex — match whatever format the CLI emitted, but **values** should match the app):

| shadcn token | App source |
| --- | --- |
| `--background` | `--bg` `#12100e` |
| `--foreground` | `--text` `#f0ebe6` |
| `--muted` | `--raised` `#24201c` |
| `--muted-foreground` | `--muted` `#9a9086` |
| `--card` / `--popover` | `--panel` `#1a1714` |
| `--card-foreground` / `--popover-foreground` | `--text` |
| `--border` / `--input` | `--border` `#3a342e` |
| `--primary` / `--accent` | `--accent` `#e8a54b` |
| `--primary-foreground` / `--accent-foreground` | near-black readable on accent (e.g. `#12100e`) |
| `--ring` | `--accent` |
| `--destructive` | `--error` `#f07178` |

Keep both naming systems: leave app `:root` vars for legacy CSS; set shadcn vars (often under `:root` and `.dark`) to the same colors so Combobox matches Economy.

- [ ] **Step 6: Verify tooling**

```bash
./node_modules/.bin/vp check
```

Expected: PASS (or only pre-existing warnings). Fix any path/alias/type errors from init before continuing.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts src/web/index.css components.json src/web/lib/utils.ts
# plus any other files init created (e.g. src/web/components/ui/.gitkeep)
git commit -m "$(cat <<'EOF'
chore: bootstrap shadcn and Tailwind with app theme tokens

EOF
)"
```

---

### Task 2: Add Combobox primitive

**Files:**
- Create/Modify: `src/web/components/ui/combobox.tsx` (+ any deps CLI adds: `button`, `input`, etc.)

**Interfaces:**
- Consumes: shadcn init from Task 1
- Produces: importable Combobox compound components from `@/web/components/ui/combobox`

- [ ] **Step 1: Add Combobox via CLI**

```bash
pnpm dlx shadcn@latest add combobox --yes
```

Confirm files land under `src/web/components/ui/` (move/fix aliases if not).

- [ ] **Step 2: Smoke-import check**

Ensure these exports exist (names may vary slightly with CLI version — adjust Task 3 to match **actual** exports):

- `Combobox`
- `ComboboxInput`
- `ComboboxContent`
- `ComboboxList`
- `ComboboxItem`
- `ComboboxEmpty`
- `ComboboxGroup`
- `ComboboxLabel`
- `ComboboxCollection`
- `ComboboxSeparator` (if provided)

Run:

```bash
./node_modules/.bin/vp check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/ui components.json package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add shadcn Combobox primitive

EOF
)"
```

---

### Task 3: `EconomyPlayerSearch` + wire into Economy page

**Files:**
- Create: `src/web/features/economy/EconomyPlayerSearch.tsx`
- Modify: `src/web/features/economy/EconomyPage.tsx`
- Modify: `src/web/index.css` (remove obsolete search list / recent styles)

**Interfaces:**
- Consumes:
  - Combobox primitives from `@/web/components/ui/combobox`
  - `api` from `../../api`
  - `buildEconomySearch` from `../../lib/economySearch`
  - `loadRecentEconomyPlayers` / `rememberEconomyPlayer` / `RecentEconomyPlayer` from `../../lib/recentEconomyPlayers`
  - `SearchUsersResponse` from `./types`
- Produces:
  - `export function EconomyPlayerSearch(props: { selectedUserId: string | null; onSelect: (userId: string, username: string) => void })`

- [ ] **Step 1: Create `EconomyPlayerSearch`**

Create `src/web/features/economy/EconomyPlayerSearch.tsx`. Adapt import paths/export names to whatever Task 2 generated. Core behavior:

```tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import {
  loadRecentEconomyPlayers,
  rememberEconomyPlayer,
  type RecentEconomyPlayer,
} from "../../lib/recentEconomyPlayers";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/web/components/ui/combobox";
import type { SearchUsersResponse } from "./types";

export type EconomyPlayerOption = {
  userId: string;
  username: string;
  source: "recent" | "result";
};

type Props = {
  selectedUserId: string | null;
  onSelect: (userId: string, username: string) => void;
};

export function EconomyPlayerSearch({ selectedUserId, onSelect }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [recent, setRecent] = useState<RecentEconomyPlayer[]>(() => loadRecentEconomyPlayers());
  const [results, setResults] = useState<SearchUsersResponse["users"]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = inputValue.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const data = await api<SearchUsersResponse>(
            `/api/economy/search?q=${encodeURIComponent(q)}`,
          );
          setResults(data.users);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [inputValue]);

  const recentIds = useMemo(() => new Set(recent.map((p) => p.userId)), [recent]);

  const resultOptions: EconomyPlayerOption[] = results
    .filter((u) => !recentIds.has(u.userId))
    .map((u) => ({ userId: u.userId, username: u.username, source: "result" as const }));

  const recentOptions: EconomyPlayerOption[] = recent.map((p) => ({
    userId: p.userId,
    username: p.username,
    source: "recent" as const,
  }));

  const items = useMemo(() => {
    const groups: { value: string; items: EconomyPlayerOption[] }[] = [];
    if (recentOptions.length > 0) {
      groups.push({ value: "recent", items: recentOptions });
    }
    if (resultOptions.length > 0) {
      groups.push({ value: "results", items: resultOptions });
    }
    return groups;
  }, [recentOptions, resultOptions]);

  function handleSelect(option: EconomyPlayerOption | null) {
    if (!option) return;
    onSelect(option.userId, option.username);
    setRecent(rememberEconomyPlayer({ userId: option.userId, username: option.username }));
    setInputValue("");
    setResults([]);
  }

  const emptyMessage = searching
    ? "Searching…"
    : inputValue.trim().length < 2
      ? recent.length === 0
        ? "Type at least 2 characters to search"
        : "Select a recent player or type to search"
      : "No players found";

  return (
    <Combobox
      items={items}
      filteredItems={items}
      filter={null}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      value={null}
      onValueChange={(next) => {
        handleSelect(next as EconomyPlayerOption | null);
      }}
      itemToStringValue={(item: EconomyPlayerOption) => item.username}
      isItemEqualToValue={(a: EconomyPlayerOption, b: EconomyPlayerOption) => a.userId === b.userId}
    >
      <ComboboxInput id="user-search" placeholder="Search by username…" autoComplete="off" />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(group: { value: string; items: EconomyPlayerOption[] }) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value === "recent" ? "Recent" : "Results"}</ComboboxLabel>
              <ComboboxCollection>
                {(item: EconomyPlayerOption) => (
                  <ComboboxItem key={`${item.source}-${item.userId}`} value={item}>
                    <span>{item.username}</span>
                    {item.source === "result" ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {item.userId.slice(-6)}
                      </span>
                    ) : null}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
              {group.value === "recent" && resultOptions.length > 0 ? <ComboboxSeparator /> : null}
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

**Important:** After generating Combobox, **reconcile** this sketch with the real shadcn/Base UI API in `combobox.tsx` (prop names for groups, `filteredItems` vs `items`, `onValueChange` signature). Prefer the CLI’s Groups example + Base UI async pattern (`filter={null}`, controlled `inputValue`). Do not fight the primitive — adjust the wrapper to match exports.

If the generated Combobox does not support grouped `items` arrays, fall back to a flat `EconomyPlayerOption[]` list with visual section headers using `ComboboxGroup` / `ComboboxLabel` as in the shadcn Groups docs (copy structure from CLI example file if present).

Unused `selectedUserId` may be used to style the matching Recent item; if unused after wiring, prefix with underscore or omit from props — but EconomyPage should still pass it for future highlight if the Item API supports `data-selected` / className.

- [ ] **Step 2: Wire into `EconomyPage`**

1. Import `EconomyPlayerSearch`.
2. Remove local state used only for the old search UI: `query`, `users`, `searching`, and the search `useEffect`.
3. Keep `recentPlayers` **out** of the page if `EconomyPlayerSearch` owns Recent — remove page-level Recent UI.
4. Keep `selectPlayer` (or inline) for navigate + any page concerns; let the child call `rememberEconomyPlayer` **or** centralize remember in `onSelect` — pick **one** place (prefer child remembers + parent navigates, or parent does both). Recommended:

```tsx
function selectPlayer(userId: string, username: string) {
  void navigate({
    search: buildEconomySearch({ userId, username }),
    replace: true,
  });
}
```

and let `EconomyPlayerSearch` call `rememberEconomyPlayer` internally (as in Step 1).

5. Replace the search section body with:

```tsx
<section className="economy-search">
  <label htmlFor="user-search">Find player</label>
  <EconomyPlayerSearch selectedUserId={selectedUserId} onSelect={selectPlayer} />
</section>
```

6. Remove unused imports (`loadRecentEconomyPlayers`, `rememberEconomyPlayer`, `RecentEconomyPlayer` from the page if no longer used).

- [ ] **Step 3: Remove obsolete CSS**

Delete from `src/web/index.css` if unused:

- `.economy-recent`, `.economy-recent-list`, `.economy-recent-btn` (+ hover/active)
- `.economy-user-list`, `.economy-user` (+ hover/active)

Keep `.economy-search` layout (label + column gap) so the Combobox sits in the same section width (`max-width: 28rem`).

- [ ] **Step 4: Verify**

```bash
./node_modules/.bin/vp test src/web/lib/recentEconomyPlayers.test.ts
./node_modules/.bin/vp check
./node_modules/.bin/vp test
```

Expected: recent tests PASS; check PASS; full suite PASS.

Manual smoke (dev server):

1. Focus Find player → popup opens; Recent group if history exists.
2. Type ≥2 chars → Results group fills in overlay (not a second list under the page).
3. Select → companies load; input clears; popup closes; Recent updates.
4. Reload → Recent still in Combobox popup.
5. Same `userId` not listed twice across Recent + Results.

- [ ] **Step 5: Commit**

```bash
git add src/web/features/economy/EconomyPlayerSearch.tsx \
  src/web/features/economy/EconomyPage.tsx \
  src/web/index.css
git commit -m "$(cat <<'EOF'
feat: replace economy player search with shadcn Combobox

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| shadcn init + Tailwind v4 | Task 1 |
| Theme mapped to existing palette | Task 1 |
| Add Combobox | Task 2 |
| Popup overlay (not stacked lists) | Task 3 |
| Recent + Results groups | Task 3 |
| Async debounce search | Task 3 |
| Select → navigate + remember + clear | Task 3 |
| Dedupe display across groups | Task 3 (`filter` recent out of results) |
| Economy find-player only | Tasks 1–3 (no other page migrations) |
| Keep recentEconomyPlayers tests | Task 3 verify |
| Out of scope migrations | Not tasked |
