# Shell Player + TanStack Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shell-level player Load control backed by TanStack Query so Companies and Growth share one in-memory user/companies cache.

**Architecture:** `QueryClientProvider` wraps the SPA. A small `PlayerSelectionProvider` holds `{ userId, username }`. Canonical companies data lives in `['companies', userId]` via `GET /api/economy/advisor`. Explicit Load/Refresh refetches with `refresh=1`. Growth keeps a separate `['growth-bootstrap', userId]` query (no second Load UI) and is invalidated when the shell refreshes companies.

**Tech Stack:** React 19, TanStack Router (existing), `@tanstack/react-query` ^5, Vitest via `vp test` / `vite-plus/test`, Vite+ (`vp check`), existing `src/web/api.ts`.

**Design:** [2026-08-02-data-tier-caching-strategy-design.md](../specs/2026-08-02-data-tier-caching-strategy-design.md)

## Global Constraints

- No new WarEra API endpoints or bootstrap mega-endpoint
- User identity = selected WarEra player (`userId` + `username`), not site auth
- Client cache is **memory only** (no pack persistence across reload)
- Shell player search + Load/Refresh is **always visible**
- Canonical companies query: `GET /api/economy/advisor?userId=` (+ `&refresh=1` on explicit Load)
- Explicit Load refreshes **user pack only**, not price/region jobs
- Prefer `vp test` / `vp check` for verification (fallback: `pnpm test` / `pnpm check` if `vp` is unavailable)
- Commit after each task
- Do not hide shell player UI on Market/Calculator in this slice

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/query/client.ts` | Shared `QueryClient` defaults (`staleTime` 9m) |
| `src/web/query/keys.ts` | Query key factories |
| `src/web/query/fetchAdvisor.ts` | Build advisor URL + `fetchAdvisor` using `api()` |
| `src/web/query/fetchAdvisor.test.ts` | Unit tests for URL / refresh param |
| `src/web/query/fetchGrowthBootstrap.ts` | Build growth bootstrap URL + fetch helper |
| `src/web/query/useCompaniesQuery.ts` | `useQuery` for advisor companies |
| `src/web/query/useGrowthBootstrapQuery.ts` | `useQuery` for growth bootstrap |
| `src/web/query/loadPlayerData.ts` | Imperative Load/Refresh (`refresh=1` + invalidate) |
| `src/web/player/PlayerSelectionContext.tsx` | Selected player state + provider |
| `src/web/player/useSyncPlayerSearch.ts` | Sync shell selection ↔ route search params |
| `src/web/layout/ShellPlayerBar.tsx` | Combobox + Load/Refresh + status |
| `src/web/layout/Shell.tsx` | Render `ShellPlayerBar` in header |
| `src/web/main.tsx` | Wrap with `QueryClientProvider` + `PlayerSelectionProvider` |
| `src/web/features/companies/CompaniesPage.tsx` | Consume shell + companies query; drop local player/refresh UI |
| `src/web/features/growth/GrowthPage.tsx` | Consume shell + bootstrap query; drop local player/refresh UI |
| `package.json` / lockfile | Add `@tanstack/react-query` |
| Design spec status | Mark approved after slice lands (Task 6) |

**Out of this plan:** `enqueueGeoRefresh`, job tier tags, MU sync, Global data on TQ, pack persistence.

---

### Task 1: Install React Query + advisor fetch helper

**Files:**
- Modify: `package.json` (via package manager)
- Create: `src/web/query/client.ts`
- Create: `src/web/query/keys.ts`
- Create: `src/web/query/fetchAdvisor.ts`
- Create: `src/web/query/fetchAdvisor.test.ts`
- Modify: `src/web/main.tsx`

**Interfaces:**
- Consumes: `api` from `src/web/api.ts`; `AdvisorResponse` from `src/web/features/companies/types.ts`
- Produces:
  - `export const COMPANY_PACK_STALE_MS = 9 * 60 * 1000`
  - `export function createAppQueryClient(): QueryClient`
  - `export const queryKeys = { companies: (userId: string) => ['companies', userId] as const, growthBootstrap: (userId: string) => ['growth-bootstrap', userId] as const }`
  - `export function advisorPath(userId: string, refresh: boolean): string`
  - `export function fetchAdvisor(userId: string, refresh: boolean): Promise<AdvisorResponse>`

- [ ] **Step 1: Write the failing test**

Create `src/web/query/fetchAdvisor.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { advisorPath, fetchAdvisor } from "./fetchAdvisor";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("advisorPath", () => {
  it("omits refresh by default", () => {
    expect(advisorPath("u1", false)).toBe("/api/economy/advisor?userId=u1");
  });

  it("adds refresh=1 when requested", () => {
    expect(advisorPath("u1", true)).toBe("/api/economy/advisor?userId=u1&refresh=1");
  });

  it("encodes userId", () => {
    expect(advisorPath("a b", false)).toBe("/api/economy/advisor?userId=a%20b");
  });
});

describe("fetchAdvisor", () => {
  it("calls api path without refresh", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        recordedAt: null,
        companiesFetchedAt: 1,
        companiesRefreshed: false,
        opportunities: [],
        companies: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdvisor("u1", false);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/economy/advisor?userId=u1");
  });

  it("calls api path with refresh=1", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        recordedAt: null,
        companiesFetchedAt: 1,
        companiesRefreshed: true,
        opportunities: [],
        companies: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdvisor("u1", true);

    const [path] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/economy/advisor?userId=u1&refresh=1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/web/query/fetchAdvisor.test.ts`

Expected: FAIL (module not found / cannot resolve `./fetchAdvisor`)

- [ ] **Step 3: Install dependency**

Run: `pnpm add @tanstack/react-query@^5`

(If the project normally uses Vite+ package commands and `vp` is on PATH: `vp add @tanstack/react-query@^5` is fine.)

Confirm `package.json` lists `"@tanstack/react-query"` under `dependencies`.

- [ ] **Step 4: Implement helpers + QueryClient + provider wrap**

`src/web/query/keys.ts`:

```ts
export const queryKeys = {
  companies: (userId: string) => ["companies", userId] as const,
  growthBootstrap: (userId: string) => ["growth-bootstrap", userId] as const,
};
```

`src/web/query/client.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

/** Slightly under server company_packs TTL (600s). */
export const COMPANY_PACK_STALE_MS = 9 * 60 * 1000;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: COMPANY_PACK_STALE_MS,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
```

`src/web/query/fetchAdvisor.ts`:

```ts
import { api } from "../api";
import type { AdvisorResponse } from "../features/companies/types";

export function advisorPath(userId: string, refresh: boolean): string {
  const qs = new URLSearchParams({ userId });
  if (refresh) qs.set("refresh", "1");
  return `/api/economy/advisor?${qs}`;
}

export function fetchAdvisor(userId: string, refresh: boolean): Promise<AdvisorResponse> {
  return api<AdvisorResponse>(advisorPath(userId, refresh));
}
```

Update `src/web/main.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { createAppQueryClient } from "./query/client";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });
const queryClient = createAppQueryClient();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Run tests and typecheck**

Run: `vp test src/web/query/fetchAdvisor.test.ts`

Expected: PASS

Run: `vp check`

Expected: PASS (or only pre-existing unrelated issues)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/web/query src/web/main.tsx
git commit -m "$(cat <<'EOF'
feat(web): add TanStack Query and advisor fetch helper

Wire QueryClientProvider and a tested refresh-aware advisor path builder for the shared companies cache.
EOF
)"
```

---

### Task 2: Player selection context

**Files:**
- Create: `src/web/player/PlayerSelectionContext.tsx`
- Create: `src/web/player/useSyncPlayerSearch.ts`
- Modify: `src/web/main.tsx` (wrap provider inside `QueryClientProvider`)

**Interfaces:**
- Consumes: none from Task 1 besides provider nesting order
- Produces:
  - `export type SelectedPlayer = { userId: string; username: string }`
  - `export function PlayerSelectionProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `export function usePlayerSelection(): { player: SelectedPlayer | null; setPlayer: (player: SelectedPlayer | null) => void }`
  - `export function useSyncPlayerSearch(args: { userId: string | undefined; username: string | undefined; navigate: (opts: { search: { userId?: string; username?: string }; replace: boolean }) => unknown }): void`  
    Behavior: if route has `userId` and shell differs, hydrate shell from route; when shell `player` is set, write it into this route’s search params. Missing route `userId` never clears shell (so Market/Dashboard keep the selected player).

- [ ] **Step 1: Write failing test for sync helper (pure extraction)**

Prefer keeping route navigate mocked. Create `src/web/player/syncPlayerSearch.ts` with a pure function used by the hook, and test that:

```ts
import { describe, expect, it } from "vite-plus/test";
import { nextPlayerFromRoute } from "./syncPlayerSearch";

describe("nextPlayerFromRoute", () => {
  it("does nothing when route has no userId (Market/etc. must not clear shell)", () => {
    expect(
      nextPlayerFromRoute(undefined, undefined, { userId: "u1", username: "Ada" }),
    ).toBeUndefined();
    expect(nextPlayerFromRoute(undefined, undefined, null)).toBeUndefined();
  });

  it("hydrates from route when shell is empty", () => {
    expect(nextPlayerFromRoute("u1", "Ada", null)).toEqual({
      userId: "u1",
      username: "Ada",
    });
  });

  it("updates shell when route userId differs", () => {
    expect(nextPlayerFromRoute("u2", "Bob", { userId: "u1", username: "Ada" })).toEqual({
      userId: "u2",
      username: "Bob",
    });
  });

  it("returns undefined when already in sync (no change)", () => {
    expect(
      nextPlayerFromRoute("u1", "Ada", { userId: "u1", username: "Ada" }),
    ).toBeUndefined();
  });
});
```

Semantics for return value:

- `SelectedPlayer` → set shell player
- `undefined` → no shell update
- Never clear shell just because the current route omits `userId`

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/web/player/syncPlayerSearch.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement sync helper + context + hook**

`src/web/player/syncPlayerSearch.ts`:

```ts
export type SelectedPlayer = { userId: string; username: string };

/** undefined = no change; object = set. Never clears on missing route params. */
export function nextPlayerFromRoute(
  routeUserId: string | undefined,
  routeUsername: string | undefined,
  current: SelectedPlayer | null,
): SelectedPlayer | undefined {
  if (!routeUserId) return undefined;
  const username = routeUsername ?? routeUserId;
  if (current?.userId === routeUserId && current.username === username) {
    return undefined;
  }
  return { userId: routeUserId, username };
}
```

`src/web/player/PlayerSelectionContext.tsx`:

```tsx
import { createContext, use, useState, type ReactNode } from "react";
import type { SelectedPlayer } from "./syncPlayerSearch";

type PlayerSelectionContextValue = {
  player: SelectedPlayer | null;
  setPlayer: (player: SelectedPlayer | null) => void;
};

const PlayerSelectionContext = createContext<PlayerSelectionContextValue | null>(null);

export function PlayerSelectionProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  return (
    <PlayerSelectionContext value={{ player, setPlayer }}>{children}</PlayerSelectionContext>
  );
}

export function usePlayerSelection(): PlayerSelectionContextValue {
  const value = use(PlayerSelectionContext);
  if (!value) {
    throw new Error("usePlayerSelection must be used within PlayerSelectionProvider");
  }
  return value;
}
```

`src/web/player/useSyncPlayerSearch.ts`:

```ts
import { useEffect } from "react";
import { usePlayerSelection } from "./PlayerSelectionContext";
import { nextPlayerFromRoute } from "./syncPlayerSearch";

type SyncArgs = {
  userId: string | undefined;
  username: string | undefined;
  navigate: (opts: {
    search: { userId?: string; username?: string };
    replace: boolean;
  }) => unknown;
};

export function useSyncPlayerSearch({ userId, username, navigate }: SyncArgs): void {
  const { player, setPlayer } = usePlayerSelection();

  // Route → shell (deep links only when route carries a userId)
  useEffect(() => {
    const next = nextPlayerFromRoute(userId, username, player);
    if (next === undefined) return;
    setPlayer(next);
  }, [userId, username, player, setPlayer]);

  // Shell → route (shareable URLs while on Companies/Growth only)
  useEffect(() => {
    if (player == null) return;
    if (player.userId === userId && player.username === username) return;
    void navigate({
      search: { userId: player.userId, username: player.username },
      replace: true,
    });
  }, [player, userId, username, navigate]);
}
```

**Note:** Only call `useSyncPlayerSearch` from Companies and Growth. Other routes leave shell selection untouched. If the two effects fight, prefer a one-time route hydration then shell-as-SoT; keep `nextPlayerFromRoute` tests green.

Wrap in `main.tsx` inside `QueryClientProvider`:

```tsx
<QueryClientProvider client={queryClient}>
  <PlayerSelectionProvider>
    <RouterProvider router={router} />
  </PlayerSelectionProvider>
</QueryClientProvider>
```

- [ ] **Step 4: Run tests**

Run: `vp test src/web/player/syncPlayerSearch.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/player src/web/main.tsx
git commit -m "$(cat <<'EOF'
feat(web): add shell player selection context

Provide selected WarEra player state and route search sync helpers for Companies/Growth deep links.
EOF
)"
```

---

### Task 3: Companies query hook + shell Load action

**Files:**
- Create: `src/web/query/useCompaniesQuery.ts`
- Create: `src/web/query/loadPlayerData.ts`
- Create: `src/web/query/loadPlayerData.test.ts`
- Create: `src/web/query/fetchGrowthBootstrap.ts`

**Interfaces:**
- Consumes: `queryKeys`, `fetchAdvisor`, `createAppQueryClient` / `QueryClient`, `COMPANY_PACK_STALE_MS`
- Produces:
  - `export function useCompaniesQuery(userId: string | null)` — `useQuery` with `queryKey: queryKeys.companies(userId)`, `queryFn: () => fetchAdvisor(userId!, false)`, `enabled: Boolean(userId)`
  - `export function growthBootstrapPath(userId: string, refresh: boolean): string`
  - `export function fetchGrowthBootstrap(userId: string, refresh: boolean): Promise<GrowthBootstrapResponse>`
  - `export async function loadPlayerData(queryClient: QueryClient, userId: string): Promise<void>` — `fetchQuery` companies with `refresh: true`, then `invalidateQueries` for `queryKeys.growthBootstrap(userId)`

- [ ] **Step 1: Write failing test for loadPlayerData**

`src/web/query/loadPlayerData.test.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { loadPlayerData } from "./loadPlayerData";
import { queryKeys } from "./keys";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadPlayerData", () => {
  it("fetches advisor with refresh=1 and invalidates growth bootstrap", async () => {
    const queryClient = new QueryClient();
    const fetchQuery = vi.spyOn(queryClient, "fetchQuery").mockResolvedValue({
      recordedAt: null,
      companiesFetchedAt: 1,
      companiesRefreshed: true,
      opportunities: [],
      companies: [],
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await loadPlayerData(queryClient, "u1");

    expect(fetchQuery).toHaveBeenCalledOnce();
    const arg = fetchQuery.mock.calls[0]![0] as {
      queryKey: readonly unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(arg.queryKey).toEqual(queryKeys.companies("u1"));

    // Ensure the queryFn used refresh=1 by stubbing fetchAdvisor via module mock if needed.
    // Prefer asserting through a vi.mock of ./fetchAdvisor:

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.growthBootstrap("u1"),
    });
  });
});
```

Also add at top of that test file (or use `vi.mock`):

```ts
const fetchAdvisor = vi.fn(async () => ({
  recordedAt: null,
  companiesFetchedAt: 1,
  companiesRefreshed: true,
  opportunities: [],
  companies: [],
}));

vi.mock("./fetchAdvisor", () => ({
  fetchAdvisor: (userId: string, refresh: boolean) => fetchAdvisor(userId, refresh),
}));
```

Then after `loadPlayerData`, assert:

```ts
expect(fetchAdvisor).toHaveBeenCalledWith("u1", true);
```

If `vi.mock` hoisting makes the local `const` awkward, use `vi.hoisted(() => ({ fetchAdvisor: vi.fn() }))` per Vitest patterns already used in the repo if any; otherwise assert only `fetchQuery` + `invalidateQueries` and document that `queryFn` closes over `fetchAdvisor(userId, true)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/web/query/loadPlayerData.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement hooks and load action**

`src/web/query/fetchGrowthBootstrap.ts`:

```ts
import type { GrowthBootstrapResponse } from "@/growth/bootstrap";
import { api } from "../api";

export function growthBootstrapPath(userId: string, refresh: boolean): string {
  const qs = new URLSearchParams({ userId });
  if (refresh) qs.set("refresh", "1");
  return `/api/growth/bootstrap?${qs}`;
}

export function fetchGrowthBootstrap(
  userId: string,
  refresh: boolean,
): Promise<GrowthBootstrapResponse> {
  return api<GrowthBootstrapResponse>(growthBootstrapPath(userId, refresh));
}
```

`src/web/query/useCompaniesQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchAdvisor } from "./fetchAdvisor";
import { queryKeys } from "./keys";

export function useCompaniesQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.companies(userId ?? ""),
    queryFn: () => fetchAdvisor(userId!, false),
    enabled: Boolean(userId),
  });
}
```

`src/web/query/useGrowthBootstrapQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchGrowthBootstrap } from "./fetchGrowthBootstrap";
import { queryKeys } from "./keys";

export function useGrowthBootstrapQuery(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.growthBootstrap(userId ?? ""),
    queryFn: () => fetchGrowthBootstrap(userId!, false),
    enabled: Boolean(userId),
  });
}
```

`src/web/query/loadPlayerData.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { fetchAdvisor } from "./fetchAdvisor";
import { queryKeys } from "./keys";

/** Explicit shell Load/Refresh: bust server company pack, then drop growth bootstrap cache. */
export async function loadPlayerData(queryClient: QueryClient, userId: string): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: queryKeys.companies(userId),
    queryFn: () => fetchAdvisor(userId, true),
  });
  await queryClient.invalidateQueries({ queryKey: queryKeys.growthBootstrap(userId) });
}
```

- [ ] **Step 4: Run tests**

Run: `vp test src/web/query/loadPlayerData.test.ts src/web/query/fetchAdvisor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/query
git commit -m "$(cat <<'EOF'
feat(web): add companies query and shell loadPlayerData

Explicit Load fetches advisor with refresh=1 and invalidates the growth bootstrap query.
EOF
)"
```

---

### Task 4: Shell player bar UI

**Files:**
- Create: `src/web/layout/ShellPlayerBar.tsx`
- Modify: `src/web/layout/Shell.tsx`
- Move or re-export: keep using `CompaniesPlayerSearch` from `src/web/features/companies/CompaniesPlayerSearch.tsx` (no rename required)

**Interfaces:**
- Consumes: `usePlayerSelection`, `useCompaniesQuery`, `useQueryClient`, `loadPlayerData`, `CompaniesPlayerSearch`
- Produces: `export function ShellPlayerBar(): JSX.Element`

- [ ] **Step 1: Implement ShellPlayerBar**

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CompaniesPlayerSearch } from "../features/companies/CompaniesPlayerSearch";
import { usePlayerSelection } from "../player/PlayerSelectionContext";
import { loadPlayerData } from "../query/loadPlayerData";
import { useCompaniesQuery } from "../query/useCompaniesQuery";

export function ShellPlayerBar() {
  const queryClient = useQueryClient();
  const { player, setPlayer } = usePlayerSelection();
  const companiesQuery = useCompaniesQuery(player?.userId ?? null);
  const [loadingAction, setLoadingAction] = useState(false);

  const busy = loadingAction || companiesQuery.isFetching;
  const hasData = companiesQuery.isSuccess;
  const label = hasData ? "Refresh" : "Load";

  async function onLoad() {
    if (!player) return;
    setLoadingAction(true);
    try {
      await loadPlayerData(queryClient, player.userId);
    } finally {
      setLoadingAction(false);
    }
  }

  return (
    <div className="ml-auto flex min-w-0 max-w-xl flex-1 items-center justify-end gap-2">
      <div className="min-w-0 w-56">
        <CompaniesPlayerSearch
          selectedUserId={player?.userId ?? null}
          onSelect={(userId, username) => setPlayer({ userId, username })}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!player || busy}
        onClick={() => void onLoad()}
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
        {busy ? "Loading…" : label}
      </Button>
      <div className="hidden min-w-0 text-xs text-muted-foreground sm:block">
        {!player ? (
          <span>No player</span>
        ) : companiesQuery.isError ? (
          <span className="text-destructive">
            {companiesQuery.error instanceof Error
              ? companiesQuery.error.message
              : "Load failed"}
          </span>
        ) : hasData ? (
          <span className="truncate">
            {player.username}
            {companiesQuery.dataUpdatedAt
              ? ` · ${new Date(companiesQuery.dataUpdatedAt).toLocaleString()}`
              : null}
          </span>
        ) : (
          <span className="truncate">{player.username} · not loaded</span>
        )}
      </div>
    </div>
  );
}
```

**Select behavior:** Choosing a player sets shell selection. `useCompaniesQuery` is `enabled` when `userId` is set, so the first select **auto-fetches without `refresh=1`** (warm server TTL). The shell button always calls `loadPlayerData` (`refresh=1`).

- [ ] **Step 2: Mount in Shell**

Update `src/web/layout/Shell.tsx` header to include the bar after the nav (flex layout already `items-center gap-6`):

```tsx
import { ShellPlayerBar } from "./ShellPlayerBar";

// inside <header>:
<header className="flex items-center gap-6 border-b border-border bg-card px-5 py-3">
  <div className="font-semibold tracking-wide">Warera</div>
  <NavigationMenu>...</NavigationMenu>
  <ShellPlayerBar />
</header>
```

- [ ] **Step 3: Manual smoke (dev server)**

Run: `pnpm dev` (or project equivalent)

Check:

1. Header shows combobox + Load on Dashboard/Market/Companies
2. Select a known player → companies query fires (Network: advisor **without** `refresh=1`)
3. Click Refresh → advisor **with** `refresh=1`
4. No console errors from missing provider

- [ ] **Step 4: Run check**

Run: `vp check`

Expected: PASS for changed files

- [ ] **Step 5: Commit**

```bash
git add src/web/layout/Shell.tsx src/web/layout/ShellPlayerBar.tsx
git commit -m "$(cat <<'EOF'
feat(web): add shell player Load bar

Always-visible player combobox and Load/Refresh backed by the shared companies query.
EOF
)"
```

---

### Task 5: Migrate Companies page

**Files:**
- Modify: `src/web/features/companies/CompaniesPage.tsx`
- Modify: `src/web/lib/companiesSearch.ts` only if sync helper needs shared search builders (prefer reuse `buildCompaniesSearch`)

**Interfaces:**
- Consumes: `usePlayerSelection`, `useSyncPlayerSearch`, `useCompaniesQuery`
- Produces: Companies page with no local player search / no “Refresh companies” button; keeps “Refresh prices” (Global)

- [ ] **Step 1: Replace local fetch/selection with shared hooks**

In `CompaniesPage`:

1. Remove `useState` for `advisor`, `loadingAdvisor`, `refreshingCompanies` (keep `polling` / `error` only if still needed for price poll).
2. `const { player } = usePlayerSelection()`
3. `useSyncPlayerSearch({ userId: search.userId, username: search.username, navigate: (opts) => navigate({ search: buildCompaniesSearch(opts.search), replace: opts.replace }) })`  
   Adapt `navigate` wrapper so it matches the page’s `buildCompaniesSearch` typing (pass through `userId`/`username` correctly; when clearing, pass empty search allowed by the route schema).
4. `const companiesQuery = useCompaniesQuery(player?.userId ?? null)`
5. `const advisor = companiesQuery.data ?? null`
6. Remove the “Find player” section and the “Refresh companies” button.
7. Empty copy when `!player`: `Load a player in the header.`
8. Empty copy when `player && !advisor && !companiesQuery.isFetching`: same guidance or show query error from `companiesQuery.error`.
9. `refreshPrices`: after `POST /api/prices/poll`, call `queryClient.invalidateQueries({ queryKey: queryKeys.companies(player.userId) })` (no `refresh=1`) instead of `loadAdvisor`.
10. Show `companiesQuery.isFetching` as “Loading advisor…” when appropriate.
11. Keep showing `advisor.recordedAt` / `advisor.companiesFetchedAt` in the status line when data exists; player name from `player.username`.

- [ ] **Step 2: Run check + existing web tests**

Run: `vp test src/web/lib/companiesSearch.test.ts src/web/query`

Run: `vp check`

Expected: PASS

- [ ] **Step 3: Manual smoke**

1. Open `/companies` → no inline player search
2. Load player from header → cards render
3. Navigate to Market and back → cards still there without Reload
4. Refresh in header → Network shows `refresh=1`
5. Deep link `/companies?userId=…&username=…` hydrates shell and loads

- [ ] **Step 4: Commit**

```bash
git add src/web/features/companies/CompaniesPage.tsx
git commit -m "$(cat <<'EOF'
refactor(companies): use shell player and shared companies query

Remove page-local player search and company refresh in favor of the header Load control.
EOF
)"
```

---

### Task 6: Migrate Growth page + mark spec approved

**Files:**
- Modify: `src/web/features/growth/GrowthPage.tsx`
- Modify: `docs/superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md` (Status → Approved)

**Interfaces:**
- Consumes: `usePlayerSelection`, `useSyncPlayerSearch`, `useGrowthBootstrapQuery`, `useCompaniesQuery` (optional; for empty-state awareness), `queryKeys`
- Produces: Growth without local player search / Refresh button; bootstrap via TQ; shell Load invalidation refetches bootstrap

- [ ] **Step 1: Wire Growth to shell + bootstrap query**

1. Remove local `CompaniesPlayerSearch`, `selectPlayer`, `loadBootstrap`, `refreshing` state, and the Refresh button in the Growth header controls.
2. `useSyncPlayerSearch` with `buildGrowthSearch` the same way as Companies.
3. `const bootstrapQuery = useGrowthBootstrapQuery(player?.userId ?? null)`
4. Keep `applyBootstrap` but drive it from `useEffect` on `bootstrapQuery.data` (when data reference/updatedAt changes, re-apply defaults carefully — only reset editable fields when `userId` or `companiesFetchedAt` / `dataUpdatedAt` changes, not on every unrelated parent render). Suggested:

```ts
const appliedKeyRef = useRef<string | null>(null);
useEffect(() => {
  const data = bootstrapQuery.data;
  const userId = player?.userId;
  if (!data || !userId) {
    if (!userId) {
      setBootstrap(null);
      setFactories([]);
      appliedKeyRef.current = null;
    }
    return;
  }
  const key = `${userId}:${bootstrapQuery.dataUpdatedAt}`;
  if (appliedKeyRef.current === key) return;
  appliedKeyRef.current = key;
  applyBootstrap(data);
}, [bootstrapQuery.data, bootstrapQuery.dataUpdatedAt, player?.userId]);
```

5. Empty state when `!player`: `Load a player in the header.`
6. Loading: `bootstrapQuery.isFetching && !bootstrap`
7. Errors: `bootstrapQuery.error` message
8. Do **not** call bootstrap with `refresh=1` from the page; shell `loadPlayerData` invalidates this query so the next fetch uses a warm/fresh server pack (invalidate triggers refetch with `fetchGrowthBootstrap(userId, false)`).  
   **If** product wants growth pack bust on shell Load as well, change `loadPlayerData` to also `fetchQuery` bootstrap with `refresh: true`. Prefer invalidate-only first (server pack already busted by advisor `refresh=1`).

- [ ] **Step 2: Tests + check**

Run: `vp test src/web/query src/web/player src/web/lib/growthSearch.test.ts`

Run: `vp check`

Expected: PASS

- [ ] **Step 3: End-to-end manual success criteria**

1. Cold session → select player in header → Load/auto-fetch
2. Open Companies → data visible
3. Open Growth → bootstrap loads **without** clicking Load again; Network bootstrap **without** `refresh=1` if pack warm
4. Click Refresh in header → advisor has `refresh=1`; growth bootstrap refetches
5. Full page reload → memory cache cleared; must Load again (recent players still in combobox)

- [ ] **Step 4: Mark design approved**

In `docs/superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md`:

Change:

```md
**Status:** Draft (pending user review)
```

to:

```md
**Status:** Approved
```

- [ ] **Step 5: Commit**

```bash
git add src/web/features/growth/GrowthPage.tsx docs/superpowers/specs/2026-08-02-data-tier-caching-strategy-design.md
git commit -m "$(cat <<'EOF'
refactor(growth): use shell player and shared query cache

Drop page-local Load UI; bootstrap reads TanStack Query and follows shell Refresh invalidation.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| TanStack Query + memory-only cache | Task 1 |
| Shell always-visible player + Load/Refresh | Task 4 |
| `['companies', userId]` via advisor | Tasks 1, 3 |
| `refresh=1` only on explicit Load | Tasks 3–4 |
| Selected player id/username (no new APIs) | Task 2 |
| Migrate Companies | Task 5 |
| Migrate Growth (no second Load UI) | Task 6 |
| URL sync optional for shareable links | Tasks 2, 5, 6 |
| Global price refresh stays page-local | Task 5 |
| No Playwright required | Manual smokes in Tasks 4–6; unit tests for path/load |
| Event enqueue / job tiers / MU | Out of plan (spec stub only) |

## Self-review notes

- No TBD placeholders in task steps.
- `loadPlayerData` always uses `fetchAdvisor(userId, true)`; passive `useCompaniesQuery` uses `false`.
- Growth bootstrap key is `['growth-bootstrap', userId]` consistently in keys, load invalidation, and hook.
- React 19: context via `use()` / `<Context value={…}>` matching composition guidance already used in repo skills.
