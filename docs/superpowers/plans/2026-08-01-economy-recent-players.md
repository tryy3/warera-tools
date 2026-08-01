# Economy Recent Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the last 5 Economy player selections in `localStorage` and show a clickable Recent row under the search input.

**Architecture:** A small pure-ish helper owns versioned `localStorage` read/write (dedupe by `userId`, MRU, cap 5). `EconomyPage` loads the list on mount, remembers on every player select (live result or recent button), and renders a compact Recent row under `#user-search`.

**Tech Stack:** React 19, Vite+, Vitest via `vite-plus/test`, plain CSS in `src/web/index.css`.

**Design:** [2026-08-01-economy-recent-players-design.md](../specs/2026-08-01-economy-recent-players-design.md)

## Global Constraints

- Storage key exactly: `economyRecentPlayers:v1`
- Persist only on select (live result or recent click) — never on typed query alone
- Store canonical `username` from the selection, not the typed search string
- Dedupe by `userId`; MRU prepend; max 5
- No remove / clear UI
- Corrupt or missing storage → empty list, no thrown error to the UI
- Prefer `vp test` for helper coverage and `vp check` before finishing
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/lib/recentEconomyPlayers.ts` | Types, load, remember (localStorage) |
| `src/web/lib/recentEconomyPlayers.test.ts` | Unit tests for dedupe / MRU / cap / corrupt data |
| `src/web/features/economy/EconomyPage.tsx` | Recent state, shared select handler, Recent UI |
| `src/web/index.css` | Styles for Recent row under `.economy-search` |

---

### Task 1: `recentEconomyPlayers` helper + tests

**Files:**
- Create: `src/web/lib/recentEconomyPlayers.ts`
- Create: `src/web/lib/recentEconomyPlayers.test.ts`

**Interfaces:**
- Consumes: browser `localStorage` (stubbed in tests)
- Produces:
  - `export type RecentEconomyPlayer = { userId: string; username: string }`
  - `export const RECENT_ECONOMY_PLAYERS_KEY = "economyRecentPlayers:v1"`
  - `export const RECENT_ECONOMY_PLAYERS_MAX = 5`
  - `export function loadRecentEconomyPlayers(): RecentEconomyPlayer[]`
  - `export function rememberEconomyPlayer(player: RecentEconomyPlayer): RecentEconomyPlayer[]`

- [ ] **Step 1: Write the failing tests**

Create `src/web/lib/recentEconomyPlayers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  RECENT_ECONOMY_PLAYERS_KEY,
  loadRecentEconomyPlayers,
  rememberEconomyPlayer,
} from "./recentEconomyPlayers";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("loadRecentEconomyPlayers", () => {
  it("returns empty when missing", () => {
    expect(loadRecentEconomyPlayers()).toEqual([]);
  });

  it("returns empty for bad JSON", () => {
    localStorage.setItem(RECENT_ECONOMY_PLAYERS_KEY, "{not-json");
    expect(loadRecentEconomyPlayers()).toEqual([]);
  });

  it("returns empty for non-array JSON", () => {
    localStorage.setItem(RECENT_ECONOMY_PLAYERS_KEY, JSON.stringify({ userId: "u1" }));
    expect(loadRecentEconomyPlayers()).toEqual([]);
  });

  it("filters invalid entries", () => {
    localStorage.setItem(
      RECENT_ECONOMY_PLAYERS_KEY,
      JSON.stringify([
        { userId: "u1", username: "alice" },
        { userId: 1, username: "bad" },
        { userId: "u2" },
        null,
        { userId: "u3", username: "bob" },
      ]),
    );
    expect(loadRecentEconomyPlayers()).toEqual([
      { userId: "u1", username: "alice" },
      { userId: "u3", username: "bob" },
    ]);
  });
});

describe("rememberEconomyPlayer", () => {
  it("dedupes by userId and keeps a single entry", () => {
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    expect(loadRecentEconomyPlayers()).toEqual([{ userId: "u1", username: "tryy3" }]);
  });

  it("stores the canonical username from the selection", () => {
    // Caller passes API username ("tryy3"), not typed "TrYy3"
    rememberEconomyPlayer({ userId: "u1", username: "tryy3" });
    expect(loadRecentEconomyPlayers()[0]?.username).toBe("tryy3");
  });

  it("updates username when re-selecting same userId", () => {
    rememberEconomyPlayer({ userId: "u1", username: "OldName" });
    rememberEconomyPlayer({ userId: "u1", username: "NewName" });
    expect(loadRecentEconomyPlayers()).toEqual([{ userId: "u1", username: "NewName" }]);
  });

  it("moves an existing player to the front (MRU)", () => {
    rememberEconomyPlayer({ userId: "u1", username: "a" });
    rememberEconomyPlayer({ userId: "u2", username: "b" });
    rememberEconomyPlayer({ userId: "u3", username: "c" });
    rememberEconomyPlayer({ userId: "u1", username: "a" });
    expect(loadRecentEconomyPlayers().map((p) => p.userId)).toEqual(["u1", "u3", "u2"]);
  });

  it("keeps only the last 5 distinct players", () => {
    for (let i = 1; i <= 6; i++) {
      rememberEconomyPlayer({ userId: `u${i}`, username: `user${i}` });
    }
    expect(loadRecentEconomyPlayers().map((p) => p.userId)).toEqual([
      "u6",
      "u5",
      "u4",
      "u3",
      "u2",
    ]);
  });

  it("does not throw when setItem fails", () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error("quota");
    };
    vi.stubGlobal("localStorage", storage);
    expect(() => rememberEconomyPlayer({ userId: "u1", username: "a" })).not.toThrow();
    // In-memory next list is still returned even if persist fails
    expect(rememberEconomyPlayer({ userId: "u1", username: "a" })).toEqual([
      { userId: "u1", username: "a" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test src/web/lib/recentEconomyPlayers.test.ts`

Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement the helper**

Create `src/web/lib/recentEconomyPlayers.ts`:

```ts
export type RecentEconomyPlayer = {
  userId: string;
  username: string;
};

export const RECENT_ECONOMY_PLAYERS_KEY = "economyRecentPlayers:v1";
export const RECENT_ECONOMY_PLAYERS_MAX = 5;

function isRecentEconomyPlayer(value: unknown): value is RecentEconomyPlayer {
  if (value == null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && typeof row.username === "string";
}

export function loadRecentEconomyPlayers(): RecentEconomyPlayer[] {
  try {
    const raw = localStorage.getItem(RECENT_ECONOMY_PLAYERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEconomyPlayer);
  } catch {
    return [];
  }
}

export function rememberEconomyPlayer(player: RecentEconomyPlayer): RecentEconomyPlayer[] {
  const next = [
    player,
    ...loadRecentEconomyPlayers().filter((p) => p.userId !== player.userId),
  ].slice(0, RECENT_ECONOMY_PLAYERS_MAX);

  try {
    localStorage.setItem(RECENT_ECONOMY_PLAYERS_KEY, JSON.stringify(next));
  } catch {
    // fail soft — still return next for in-session UI
  }

  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test src/web/lib/recentEconomyPlayers.test.ts`

Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/recentEconomyPlayers.ts src/web/lib/recentEconomyPlayers.test.ts
git commit -m "$(cat <<'EOF'
feat: add localStorage helper for recent economy players

EOF
)"
```

---

### Task 2: Economy page Recent UI

**Files:**
- Modify: `src/web/features/economy/EconomyPage.tsx`
- Modify: `src/web/index.css` (after `.economy-search` / near `.economy-user-list`)

**Interfaces:**
- Consumes: `loadRecentEconomyPlayers`, `rememberEconomyPlayer`, `RecentEconomyPlayer`, `buildEconomySearch`
- Produces: shared `selectPlayer(userId, username)` used by live results and Recent buttons; Recent row markup

- [ ] **Step 1: Wire imports and recent state**

In `EconomyPage.tsx`, add import:

```tsx
import {
  loadRecentEconomyPlayers,
  rememberEconomyPlayer,
  type RecentEconomyPlayer,
} from "../../lib/recentEconomyPlayers";
```

Inside `EconomyPage`, after existing state declarations, add:

```tsx
const [recentPlayers, setRecentPlayers] = useState<RecentEconomyPlayer[]>(() =>
  loadRecentEconomyPlayers(),
);
```

Add a shared select handler (inside the component, before `return`):

```tsx
function selectPlayer(userId: string, username: string) {
  void navigate({
    search: buildEconomySearch({ userId, username }),
    replace: true,
  });
  setRecentPlayers(rememberEconomyPlayer({ userId, username }));
}
```

- [ ] **Step 2: Use `selectPlayer` for live search results**

Replace the live-result `onClick` body so it calls `selectPlayer` instead of only navigating:

```tsx
onClick={() => {
  selectPlayer(u.userId, u.username);
}}
```

- [ ] **Step 3: Render Recent row under the input**

Immediately after the `#user-search` `<input>` (before the “Searching…” line), add:

```tsx
{recentPlayers.length > 0 ? (
  <div className="economy-recent">
    <span className="muted small">Recent</span>
    <ul className="economy-recent-list">
      {recentPlayers.map((p) => (
        <li key={p.userId}>
          <button
            type="button"
            className={
              selectedUserId === p.userId
                ? "economy-recent-btn active"
                : "economy-recent-btn"
            }
            onClick={() => {
              selectPlayer(p.userId, p.username);
            }}
          >
            {p.username}
          </button>
        </li>
      ))}
    </ul>
  </div>
) : null}
```

Keep this block independent of `users` / `query` so it stays visible while typing.

- [ ] **Step 4: Add CSS**

In `src/web/index.css`, after `.economy-search input { ... }`, add:

```css
.economy-recent {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.economy-recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.economy-recent-btn {
  font: inherit;
  font-size: 0.875rem;
  color: var(--text);
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}

.economy-recent-btn:hover,
.economy-recent-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent, var(--border));
}
```

If `--accent` is not defined in this stylesheet, omit the `border-color` override and keep only the background change to match `.economy-user.active`.

- [ ] **Step 5: Verify**

Run:

```bash
vp test src/web/lib/recentEconomyPlayers.test.ts
vp check
```

Expected: tests PASS; check PASS (format / lint / types).

Manual smoke (optional if `vp run dev` / `pnpm dev` is already running):

1. Open Economy, search a player, click a result → Recent shows canonical username.
2. Click the same player again → still one Recent entry.
3. Select 6 distinct players → only 5 remain, most recent first.
4. Reload the page → Recent list persists.
5. Click a Recent button → loads that player’s companies; button shows active.

- [ ] **Step 6: Commit**

```bash
git add src/web/features/economy/EconomyPage.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
feat: show recent economy players under search

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| localStorage + versioned key | Task 1 |
| Persist on select only | Task 2 (`selectPlayer`) |
| Canonical username | Task 1 tests + Task 2 passes API username |
| Dedupe by userId | Task 1 |
| MRU + max 5 | Task 1 |
| No remove/clear | (intentionally omitted) |
| Recent UI under input, visible while typing | Task 2 |
| Active highlight | Task 2 |
| Corrupt storage fail-soft | Task 1 |
| Unit tests | Task 1 |
