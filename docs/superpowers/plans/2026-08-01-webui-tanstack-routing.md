# WebUI TanStack Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each WebUI tab a real URL via file-based TanStack Router, with omit-by-default shareable search params on Calculator and Economy.

**Architecture:** Install `@tanstack/react-router` + `@tanstack/router-plugin`. Route files live under `src/web/routes/`; `__root.tsx` wraps `Shell` + `<Outlet />`. Pure `validateSearch` helpers own optional param parsing/stripping. Feature pages sync selection to the URL with `replace: true` and never write defaults on first visit.

**Tech Stack:** React 19, TanStack Router (file-based), Vite+ (`vp`), Vitest via `vp test`, TypeScript.

## Global Constraints

- Follow design spec: `docs/superpowers/specs/2026-08-01-webui-tanstack-routing-design.md`
- File-based routes under `src/web/routes/`; commit generated `src/web/routeTree.gen.ts`
- Shareable search params only on Calculator (`tier`, `country`, `price`) and Economy (`userId`, `username`)
- Omit-by-default: never write default/empty values into the URL on first visit
- Search updates use `replace: true`; tab navigations use normal push
- No Zod; lightweight parsers only
- No Jobs deep links; no Countries form state in URL; no API/server route changes
- Unknown paths redirect to `/`
- Prefer `vp test` / `vp check` for verification
- Install packages with `pnpm` / `vp install` (project uses Vite+)

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/lib/calculatorSearch.ts` | Parse/build Calculator search params |
| `src/web/lib/calculatorSearch.test.ts` | Unit tests for Calculator search helpers |
| `src/web/lib/economySearch.ts` | Parse/build Economy search params |
| `src/web/lib/economySearch.test.ts` | Unit tests for Economy search helpers |
| `vite.config.ts` | `tanstackRouter` plugin + `appType: 'spa'` |
| `package.json` | Add router deps |
| `src/web/routes/__root.tsx` | Shell layout + Outlet |
| `src/web/routes/index.tsx` | Dashboard `/` |
| `src/web/routes/jobs.tsx` | Jobs `/jobs` |
| `src/web/routes/calculator.tsx` | Calculator + `validateSearch` |
| `src/web/routes/economy.tsx` | Economy + `validateSearch` |
| `src/web/routes/countries.tsx` | Countries `/countries` |
| `src/web/routes/$.tsx` | Catch-all → redirect `/` |
| `src/web/routeTree.gen.ts` | Generated route tree (committed) |
| `src/web/main.tsx` | `createRouter` + `RouterProvider` |
| `src/web/layout/Shell.tsx` | `Link` nav; drop `TabId` state |
| `src/web/index.css` | Ensure `.nav-link` works on `<a>` |
| `src/web/features/calculator/CalculatorPage.tsx` | Sync tier/country/price with search |
| `src/web/features/economy/EconomyPage.tsx` | Sync selected user with search |
| `src/web/App.tsx` | **Delete** |

---

### Task 1: Calculator & Economy search helpers

**Files:**
- Create: `src/web/lib/calculatorSearch.ts`
- Create: `src/web/lib/calculatorSearch.test.ts`
- Create: `src/web/lib/economySearch.ts`
- Create: `src/web/lib/economySearch.test.ts`

**Interfaces:**
- Consumes: `GearTierId` from `@/calculator`
- Produces:
  - `export type CalculatorSearch = { tier?: GearTierId; country?: string; price?: string }`
  - `export const DEFAULT_CALC_TIER: GearTierId` (`"green"`)
  - `export function parseCalculatorSearch(search: Record<string, unknown>): CalculatorSearch`
  - `export function buildCalculatorSearch(input: { tier: GearTierId; countryId: string; inclPrice: string; defaultCountryId: string }): CalculatorSearch`
  - `export type EconomySearch = { userId?: string; username?: string }`
  - `export function parseEconomySearch(search: Record<string, unknown>): EconomySearch`
  - `export function buildEconomySearch(input: { userId: string | null; username: string | null }): EconomySearch`

- [ ] **Step 1: Write failing Calculator search tests**

Create `src/web/lib/calculatorSearch.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_CALC_TIER,
  buildCalculatorSearch,
  parseCalculatorSearch,
} from "./calculatorSearch";

describe("parseCalculatorSearch", () => {
  it("returns empty object when nothing valid is present", () => {
    expect(parseCalculatorSearch({})).toEqual({});
    expect(parseCalculatorSearch({ tier: "green" })).toEqual({ tier: "green" });
    expect(parseCalculatorSearch({ tier: "nope" })).toEqual({});
    expect(parseCalculatorSearch({ price: "abc" })).toEqual({});
    expect(parseCalculatorSearch({ price: "" })).toEqual({});
  });

  it("accepts valid tier, country, and numeric price", () => {
    expect(
      parseCalculatorSearch({
        tier: "blue",
        country: "sweden",
        price: "3.9",
      }),
    ).toEqual({ tier: "blue", country: "sweden", price: "3.9" });
  });
});

describe("buildCalculatorSearch", () => {
  it("omits defaults and empty price", () => {
    expect(
      buildCalculatorSearch({
        tier: DEFAULT_CALC_TIER,
        countryId: "sweden",
        inclPrice: "",
        defaultCountryId: "sweden",
      }),
    ).toEqual({});
  });

  it("includes only non-default / non-empty fields", () => {
    expect(
      buildCalculatorSearch({
        tier: "blue",
        countryId: "norway",
        inclPrice: "2.5",
        defaultCountryId: "sweden",
      }),
    ).toEqual({ tier: "blue", country: "norway", price: "2.5" });
  });
});
```

- [ ] **Step 2: Write failing Economy search tests**

Create `src/web/lib/economySearch.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { buildEconomySearch, parseEconomySearch } from "./economySearch";

describe("parseEconomySearch", () => {
  it("returns empty when absent or blank", () => {
    expect(parseEconomySearch({})).toEqual({});
    expect(parseEconomySearch({ userId: "  ", username: "" })).toEqual({});
  });

  it("trims userId and username", () => {
    expect(parseEconomySearch({ userId: " abc ", username: " Bob " })).toEqual({
      userId: "abc",
      username: "Bob",
    });
  });
});

describe("buildEconomySearch", () => {
  it("returns empty when no user selected", () => {
    expect(buildEconomySearch({ userId: null, username: null })).toEqual({});
  });

  it("includes userId and optional username", () => {
    expect(buildEconomySearch({ userId: "u1", username: "Alice" })).toEqual({
      userId: "u1",
      username: "Alice",
    });
    expect(buildEconomySearch({ userId: "u1", username: null })).toEqual({
      userId: "u1",
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `vp test src/web/lib/calculatorSearch.test.ts src/web/lib/economySearch.test.ts`

Expected: FAIL (cannot resolve modules)

- [ ] **Step 4: Implement helpers**

Create `src/web/lib/calculatorSearch.ts`:

```ts
import { GEAR_TIERS, type GearTierId } from "@/calculator";

export type CalculatorSearch = {
  tier?: GearTierId;
  country?: string;
  price?: string;
};

export const DEFAULT_CALC_TIER: GearTierId = "green";

const TIER_IDS = new Set<string>(GEAR_TIERS.map((t) => t.id));

function isGearTierId(value: string): value is GearTierId {
  return TIER_IDS.has(value);
}

export function parseCalculatorSearch(search: Record<string, unknown>): CalculatorSearch {
  const out: CalculatorSearch = {};

  if (typeof search.tier === "string" && isGearTierId(search.tier)) {
    out.tier = search.tier;
  }

  if (typeof search.country === "string") {
    const country = search.country.trim();
    if (country) out.country = country;
  }

  if (typeof search.price === "string") {
    const price = search.price.trim();
    if (price !== "" && Number.isFinite(Number(price))) {
      out.price = price;
    }
  }

  return out;
}

export function buildCalculatorSearch(input: {
  tier: GearTierId;
  countryId: string;
  inclPrice: string;
  defaultCountryId: string;
}): CalculatorSearch {
  const out: CalculatorSearch = {};
  if (input.tier !== DEFAULT_CALC_TIER) out.tier = input.tier;
  if (input.countryId && input.countryId !== input.defaultCountryId) {
    out.country = input.countryId;
  }
  const price = input.inclPrice.trim();
  if (price !== "" && Number.isFinite(Number(price))) out.price = price;
  return out;
}
```

Create `src/web/lib/economySearch.ts`:

```ts
export type EconomySearch = {
  userId?: string;
  username?: string;
};

export function parseEconomySearch(search: Record<string, unknown>): EconomySearch {
  const out: EconomySearch = {};

  if (typeof search.userId === "string") {
    const userId = search.userId.trim();
    if (userId) out.userId = userId;
  }

  if (typeof search.username === "string") {
    const username = search.username.trim();
    if (username) out.username = username;
  }

  return out;
}

export function buildEconomySearch(input: {
  userId: string | null;
  username: string | null;
}): EconomySearch {
  if (!input.userId) return {};
  const out: EconomySearch = { userId: input.userId };
  if (input.username) out.username = input.username;
  return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp test src/web/lib/calculatorSearch.test.ts src/web/lib/economySearch.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/web/lib/calculatorSearch.ts src/web/lib/calculatorSearch.test.ts \
  src/web/lib/economySearch.ts src/web/lib/economySearch.test.ts
git commit -m "$(cat <<'EOF'
feat: add optional search param helpers for calculator and economy

EOF
)"
```

---

### Task 2: Install TanStack Router and configure Vite

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `pnpm-lock.yaml` (via install)

**Interfaces:**
- Consumes: existing `lazyPlugins` / `defineConfig` from `vite-plus`
- Produces: Vite config with `tanstackRouter({ target: 'react', autoCodeSplitting: true, routesDirectory: './src/web/routes', generatedRouteTree: './src/web/routeTree.gen.ts' })` **before** `react()`, plus `appType: 'spa'`

- [ ] **Step 1: Install dependencies**

Run:

```bash
pnpm add @tanstack/react-router
pnpm add -D @tanstack/router-plugin
```

Expected: packages appear in `package.json` dependencies / devDependencies.

- [ ] **Step 2: Update `vite.config.ts`**

Replace the plugins / top-level config appropriately. Full expected shape:

```ts
import path from "node:path";
import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  fmt: {
    ignorePatterns: ["docs/**", ".superpowers/**", "*.md", "flake.nix", "flake.lock"],
  },
  lint: {
    ignorePatterns: ["docs/**", ".superpowers/**"],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  test: {
    passWithNoTests: true,
  },
  appType: "spa",
  plugins: lazyPlugins(() => [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/web/routes",
      generatedRouteTree: "./src/web/routeTree.gen.ts",
    }),
    react(),
  ]),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  pack: {
    entry: "src/server/index.ts",
    outDir: "dist/server",
    format: "esm",
    platform: "node",
    target: "node22",
    tsconfig: "tsconfig.server.json",
    dts: false,
    fixedExtension: false,
    deps: {
      neverBundle: true,
    },
  },
});
```

Keep any other existing `fmt`/`lint` settings if they differ slightly — only ensure `appType`, `tanstackRouter` (before `react`), and path overrides are present.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts
git commit -m "$(cat <<'EOF'
chore: add TanStack Router and Vite SPA plugin config

EOF
)"
```

---

### Task 3: Scaffold file routes, Shell Links, and router bootstrap

**Files:**
- Create: `src/web/routes/__root.tsx`
- Create: `src/web/routes/index.tsx`
- Create: `src/web/routes/jobs.tsx`
- Create: `src/web/routes/calculator.tsx`
- Create: `src/web/routes/economy.tsx`
- Create: `src/web/routes/countries.tsx`
- Create: `src/web/routes/$.tsx`
- Create: `src/web/routeTree.gen.ts` (via plugin generate)
- Modify: `src/web/layout/Shell.tsx`
- Modify: `src/web/main.tsx`
- Modify: `src/web/index.css` (nav link `<a>` styles)
- Delete: `src/web/App.tsx`

**Interfaces:**
- Consumes: page components from `src/web/features/*/`; search parsers from Task 1
- Produces: working path routing for all five tabs; catch-all redirects to `/`

- [ ] **Step 1: Rewrite `Shell` to use `Link`**

Replace `src/web/layout/Shell.tsx` entirely with:

```tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type ShellProps = {
  children: ReactNode;
};

const tabs = [
  { to: "/", label: "Dashboard" },
  { to: "/jobs", label: "Jobs" },
  { to: "/calculator", label: "Calculator" },
  { to: "/economy", label: "Economy" },
  { to: "/countries", label: "Countries" },
] as const;

export function Shell({ children }: ShellProps) {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-brand">Warera</div>
        <nav className="shell-nav">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="nav-link"
              activeProps={{ className: "nav-link active" }}
              activeOptions={tab.to === "/" ? { exact: true } : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Adjust CSS so nav links look correct as anchors**

In `src/web/index.css`, update `.nav-link` to include:

```css
.nav-link {
  border: 1px solid transparent;
  background: transparent;
  padding: 0.35rem 0.7rem;
  border-radius: 4px;
  color: var(--muted);
  text-decoration: none;
  cursor: pointer;
  font: inherit;
}
```

- [ ] **Step 3: Create route files**

`src/web/routes/__root.tsx`:

```tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Shell } from "../layout/Shell";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
```

`src/web/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../features/dashboard/DashboardPage";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
```

`src/web/routes/jobs.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { JobsPage } from "../features/jobs/JobsPage";

export const Route = createFileRoute("/jobs")({
  component: JobsPage,
});
```

`src/web/routes/calculator.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CalculatorPage } from "../features/calculator/CalculatorPage";
import { parseCalculatorSearch } from "../lib/calculatorSearch";

export const Route = createFileRoute("/calculator")({
  validateSearch: (search: Record<string, unknown>) => parseCalculatorSearch(search),
  component: CalculatorPage,
});
```

`src/web/routes/economy.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { EconomyPage } from "../features/economy/EconomyPage";
import { parseEconomySearch } from "../lib/economySearch";

export const Route = createFileRoute("/economy")({
  validateSearch: (search: Record<string, unknown>) => parseEconomySearch(search),
  component: EconomyPage,
});
```

`src/web/routes/countries.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { CountriesPage } from "../features/countries/CountriesPage";

export const Route = createFileRoute("/countries")({
  component: CountriesPage,
});
```

`src/web/routes/$.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
```

- [ ] **Step 4: Generate route tree**

Run a short Vite build/dev so the plugin writes `src/web/routeTree.gen.ts`:

```bash
pnpm exec vite build --outDir /tmp/warera-web-routegen
```

If that conflicts with `vp`, use:

```bash
vp run build
```

(or start `vp run dev:web` briefly and stop once `src/web/routeTree.gen.ts` exists).

Confirm `src/web/routeTree.gen.ts` exists and exports `routeTree`.

- [ ] **Step 5: Wire `main.tsx` and delete `App.tsx`**

Replace `src/web/main.tsx` with:

```tsx
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

Delete `src/web/App.tsx`.

- [ ] **Step 6: Typecheck / test**

Run: `vp check`

Expected: PASS (or only pre-existing unrelated issues). Fix any route/`Link` typing errors before continuing.

Manual smoke (with `vp run` / `pnpm dev` if server+web are up): open `/`, `/jobs`, `/calculator`, `/economy`, `/countries`; refresh each; hit `/nope` and confirm redirect to `/`.

- [ ] **Step 7: Commit**

```bash
git add src/web/routes src/web/routeTree.gen.ts src/web/main.tsx \
  src/web/layout/Shell.tsx src/web/index.css
git rm src/web/App.tsx
git commit -m "$(cat <<'EOF'
feat: add file-based TanStack routes for WebUI tabs

EOF
)"
```

---

### Task 4: Wire Calculator page to search params

**Files:**
- Modify: `src/web/features/calculator/CalculatorPage.tsx`
- Test: `src/web/lib/calculatorSearch.test.ts` (already green; no new tests required unless helpers change)

**Interfaces:**
- Consumes: `Route` from `src/web/routes/calculator.tsx` via `getRouteApi('/calculator')` **or** importing `Route` from the route module; `buildCalculatorSearch`, `DEFAULT_CALC_TIER`, `parseCalculatorSearch` behavior from Task 1
- Produces: Calculator UI that reads/writes optional `tier` / `country` / `price` without writing defaults on mount

- [ ] **Step 1: Update `CalculatorPage` to sync with the route**

In `src/web/features/calculator/CalculatorPage.tsx`:

1. Import route API and helpers:

```ts
import { getRouteApi } from "@tanstack/react-router";
import {
  DEFAULT_CALC_TIER,
  buildCalculatorSearch,
} from "../../lib/calculatorSearch";

const calculatorRoute = getRouteApi("/calculator");
```

2. Inside the component, replace local `tier` / `inclPrice` / URL-driving `countryId` init with search-backed values:

```ts
const search = calculatorRoute.useSearch();
const navigate = calculatorRoute.useNavigate();

const tier = search.tier ?? DEFAULT_CALC_TIER;
const inclPrice = search.price ?? "";
```

Keep `countryId` in local state for load-time defaulting, but initialize from `search.country` when present:

```ts
const [countryId, setCountryIdState] = useState(search.country ?? "");
```

After countries load, preserve search country if valid; otherwise `pickDefaultCountryId` — **do not** navigate just to write the default country into the URL.

3. Add a helper used by all control changes:

```ts
function syncSearch(next: {
  tier: typeof tier;
  countryId: string;
  inclPrice: string;
  defaultCountryId: string;
}) {
  void navigate({
    search: buildCalculatorSearch(next),
    replace: true,
  });
}
```

4. Wire controls:

- `TierPicker` `onChange`: `syncSearch({ tier: next, countryId, inclPrice, defaultCountryId: pickDefaultCountryId(countries) })`
- `CountrySelect` `onChange`: update local `countryId` **and** `syncSearch(...)`
- price `onChange`: `syncSearch({ tier, countryId, inclPrice: e.target.value, defaultCountryId: pickDefaultCountryId(countries) })`

When `countries` is still empty, `defaultCountryId` may be `""`; that is fine — only non-default countries are written.

5. Remove obsolete `useState` for `tier` and `inclPrice`.

Keep data loading (`loadData`, scraps, etc.) as today. When applying `setCountryId` after fetch:

```ts
setCountryIdState((prev) => {
  if (search.country && countriesData.countries.some((c) => c.id === search.country)) {
    return search.country;
  }
  if (prev && countriesData.countries.some((c) => c.id === prev)) return prev;
  return pickDefaultCountryId(countriesData.countries);
});
```

Do **not** call `navigate` inside `loadData`.

- [ ] **Step 2: Verify manually + check**

Run: `vp check` and `vp test src/web/lib/calculatorSearch.test.ts`

Manual: visit `/calculator` — URL stays without `tier=green`. Change tier to blue — URL gets `?tier=blue`. Change back to green — `tier` removed. Set country/price similarly. Open `/calculator?tier=blue&country=sweden&price=3.9` — controls reflect those values.

- [ ] **Step 3: Commit**

```bash
git add src/web/features/calculator/CalculatorPage.tsx
git commit -m "$(cat <<'EOF'
feat: sync calculator controls with optional URL search params

EOF
)"
```

---

### Task 5: Wire Economy page to search params

**Files:**
- Modify: `src/web/features/economy/EconomyPage.tsx`

**Interfaces:**
- Consumes: `getRouteApi('/economy')`; `buildEconomySearch` from `src/web/lib/economySearch.ts`
- Produces: Economy selection driven by `userId` / `username` search params; search-as-you-type remains local

- [ ] **Step 1: Update `EconomyPage` selection flow**

In `src/web/features/economy/EconomyPage.tsx`:

1. Imports:

```ts
import { getRouteApi } from "@tanstack/react-router";
import { buildEconomySearch } from "../../lib/economySearch";

const economyRoute = getRouteApi("/economy");
```

2. Inside the component:

```ts
const search = economyRoute.useSearch();
const navigate = economyRoute.useNavigate();

const selectedUserId = search.userId ?? null;
const selectedUsername = search.username ?? null;
```

Remove local `useState` for `selectedUserId` / `selectedUsername`.

3. Change `loadAdvisor` so it **only fetches** (does not set selection state). Selection is owned by the URL:

```ts
async function loadAdvisor(userId: string) {
  setLoadingAdvisor(true);
  setError(null);
  try {
    const data = await api<AdvisorResponse>(
      `/api/economy/advisor?userId=${encodeURIComponent(userId)}`,
    );
    setAdvisor(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    setAdvisor(null);
  } finally {
    setLoadingAdvisor(false);
  }
}
```

4. When search has a `userId`, load advisor (and keep params on failure):

```ts
useEffect(() => {
  if (!selectedUserId) {
    setAdvisor(null);
    return;
  }
  void loadAdvisor(selectedUserId);
}, [selectedUserId]);
```

5. User list click navigates:

```ts
onClick={() => {
  void navigate({
    search: buildEconomySearch({ userId: u.userId, username: u.username }),
    replace: true,
  });
}}
```

6. `refreshPrices` uses `selectedUserId` from search; if present, call `loadAdvisor(selectedUserId)` again.

7. Display name: prefer `selectedUsername`; if missing but advisor loaded, show whatever label the page already uses / fall back to `selectedUserId`.

- [ ] **Step 2: Verify**

Run: `vp check` and `vp test src/web/lib/economySearch.test.ts`

Manual: `/economy` has no selection and clean URL. Pick a user → `?userId=…&username=…`. Refresh keeps that user loaded. Open bare `/economy` again → empty selection.

- [ ] **Step 3: Commit**

```bash
git add src/web/features/economy/EconomyPage.tsx
git commit -m "$(cat <<'EOF'
feat: sync economy player selection with optional URL search params

EOF
)"
```

---

### Task 6: Final verification

**Files:**
- None expected (fix only if `vp check` reveals issues)

- [ ] **Step 1: Run full checks**

```bash
vp test
vp check
```

Expected: all tests pass; lint/types clean.

- [ ] **Step 2: Manual acceptance against success criteria**

With web (and API if needed) running:

1. Refresh on `/`, `/jobs`, `/calculator`, `/economy`, `/countries` stays on that tab.
2. Browser back/forward moves between tabs.
3. `/calculator?tier=blue&country=sweden` applies values; bare `/calculator` does not auto-add defaults to the URL.
4. `/economy?userId=…&username=…` loads advisor; bare `/economy` is empty.
5. Jobs has no selection query params.
6. `/does-not-exist` redirects to `/`.

- [ ] **Step 3: Commit any leftover fixes** (only if Step 1–2 required code changes)

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: address routing verification issues

EOF
)"
```

If nothing to fix, skip this commit.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| File-based TanStack Router under `src/web/routes/` | 2, 3 |
| Commit `routeTree.gen.ts` | 3 |
| Tab paths `/`, `/jobs`, `/calculator`, `/economy`, `/countries` | 3 |
| Shell `Link` nav; drop `TabId` | 3 |
| Delete `App.tsx` | 3 |
| SPA fallback / `appType: 'spa'` | 2 |
| Calculator optional `tier`/`country`/`price` omit-by-default | 1, 4 |
| Economy optional `userId`/`username` | 1, 5 |
| Skip Jobs shareable state | 3 (no search on jobs) |
| Invalid tier/price ignored | 1 (`parseCalculatorSearch`) |
| Unknown path → `/` | 3 (`$.tsx`) |
| `replace: true` for search edits | 4, 5 |
| Unit tests for search helpers | 1 |
| No API changes | — (none planned) |
