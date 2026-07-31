# War-Command Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retheme the WebUI to a dark-only war-command palette (warm near-black surfaces + amber accents) via CSS tokens in `src/web/index.css`.

**Architecture:** Expand `:root` semantic variables (`--bg`, `--panel`, `--raised`, `--border`, `--text`, `--muted`, `--accent`, `--accent-soft`, `--error`, `--success`) and replace hardcoded light colors in shell/nav/page/table/form styles. Tier-tile gradients stay unchanged. No React or layout changes.

**Tech Stack:** Plain CSS in Vite React WebUI; verify with `rg` leftover-color checks + `vp check` + manual visual pass.

## Global Constraints

- Follow design spec: `docs/superpowers/specs/2026-07-31-war-command-dark-theme-design.md`
- Dark-only: `color-scheme: dark`; no light/dark toggle
- Accent is warm amber `#e8a54b` (not blue)
- Do not change tier-tile gradients, cyan selection ring, or chest asset styles
- Prefer CSS tokens; no leftover `#fff`, `#ffffff`, `#f3f4f6`, `#f8fafc`, `#dbeafe`, `#bfdbfe`, `#1d4ed8` outside tier tiles
- Do not edit unrelated dirty files (`CountriesPage.tsx`, `JobsPage.tsx`) unless required
- No new fonts, textures, motion, or component libraries
- Prefer `vp check` for verification; CSS-only so unit tests need not change

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/index.css` | All theme tokens and component color rules |

---

### Task 1: Dark tokens + shell / nav / page chrome

**Files:**
- Modify: `src/web/index.css` (`:root`, `.nav-link*`, leave structure classes unchanged)

**Interfaces:**
- Consumes: existing class names in `Shell.tsx` / pages (`.shell-header`, `.nav-link`, `.page`, etc.)
- Produces: updated `:root` tokens including `--raised` and `--success`

- [ ] **Step 1: Replace `:root` token block**

In `src/web/index.css`, replace the `:root` variable block so it matches:

```css
:root {
  --text: #f0ebe6;
  --muted: #9a9086;
  --bg: #12100e;
  --panel: #1a1714;
  --raised: #24201c;
  --border: #3a342e;
  --error: #f07178;
  --success: #6bbf8a;
  --accent: #e8a54b;
  --accent-soft: rgba(232, 165, 75, 0.16);
  --sans: system-ui, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, Consolas, monospace;

  font: 14px/1.45 var(--sans);
  color: var(--text);
  background: var(--bg);
  color-scheme: dark;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Retoken nav hover / active**

Replace the nav hover/active rules:

```css
.nav-link:hover {
  color: var(--text);
  background: var(--raised);
}

.nav-link.active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: rgba(232, 165, 75, 0.45);
}
```

(Header/page already use `var(--panel)` / `var(--border)` / `var(--text)` — no change needed there if tokens are dark.)

- [ ] **Step 3: Smoke-check tokens**

Run:

```bash
rg -n "color-scheme:|--bg:|--accent:|--raised:|--success:" src/web/index.css
```

Expected: `color-scheme: dark`, `--bg: #12100e`, `--accent: #e8a54b`, `--raised` and `--success` present.

- [ ] **Step 4: Commit**

```bash
git add src/web/index.css
git commit -m "$(cat <<'EOF'
style: add war-command dark CSS tokens

EOF
)"
```

---

### Task 2: Tables, buttons, forms, country select, status colors

**Files:**
- Modify: `src/web/index.css` (hardcoded light fills / borders / profit green)

**Interfaces:**
- Consumes: `--raised`, `--panel`, `--border`, `--text`, `--accent-soft`, `--success`, `--error` from Task 1
- Produces: dark-coherent interactive surfaces; tier-tile block untouched

- [ ] **Step 1: Retoken tables and action buttons**

Replace these rules (keep selectors; change values only):

```css
.jobs-table th {
  background: var(--raised);
  font-weight: 600;
}

.jobs-table tr.selected {
  background: var(--accent-soft);
}

.actions button,
.page-header button {
  border: 1px solid var(--border);
  background: var(--raised);
  border-radius: 4px;
  padding: 0.25rem 0.55rem;
  color: var(--text);
}

.actions button:hover:not(:disabled),
.page-header button:hover:not(:disabled) {
  border-color: rgba(232, 165, 75, 0.55);
}
```

- [ ] **Step 2: Retoken calc controls, country form, country select**

```css
.calc-controls select,
.calc-controls input {
  font: inherit;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  min-width: 10rem;
  background: var(--raised);
}

.country-form input,
.jobs-table input {
  font: inherit;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  background: var(--raised);
}

.country-form button {
  border: 1px solid var(--border);
  background: var(--raised);
  border-radius: 4px;
  padding: 0.3rem 0.7rem;
  color: var(--text);
}

.country-form button:hover:not(:disabled) {
  border-color: rgba(232, 165, 75, 0.55);
}

.country-select-trigger {
  width: 100%;
  text-align: left;
  font: inherit;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  background: var(--raised);
}

.country-select-list {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  max-height: 16rem;
  overflow: auto;
}
```

(`.country-select-list button:hover` / `.is-selected` already use `var(--accent-soft)` — leave as-is once soft is amber.)

- [ ] **Step 3: Retoken profit status**

```css
.profit-positive {
  color: var(--success);
  font-weight: 600;
}

.profit-negative {
  color: var(--error);
  font-weight: 600;
}
```

- [ ] **Step 4: Guard against leftover light chrome (exclude tier tiles)**

Run:

```bash
rg -n "#fff|#ffffff|#f3f4f6|#f8fafc|#dbeafe|#bfdbfe|#1d4ed8|#15803d|background: #fff|color-scheme: light" src/web/index.css
```

Expected: **no matches** outside the `.tier-tile*` block. The blue `#1d4ed8` may still appear inside `.tier-tile--blue` gradient — that is allowed. If `#1d4ed8` appears only there, fine. If it appears in nav/accent rules, fix it.

Also confirm no white fills remain:

```bash
rg -n "background:\s*#fff|background:\s*#ffffff|background:\s*white" src/web/index.css
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/web/index.css
git commit -m "$(cat <<'EOF'
style: darken WebUI surfaces for war-command theme

EOF
)"
```

---

### Task 3: Verification

**Files:**
- Verify only: `src/web/index.css` (no further edits unless a leftover fails Step 1)

**Interfaces:**
- Consumes: Tasks 1–2 complete theme
- Produces: confirmed dark theme + green check tooling

- [ ] **Step 1: Run check**

```bash
vp check
```

Expected: format/lint/types pass (CSS-only change).

- [ ] **Step 2: Visual pass in the running WebUI**

With `vp run dev` (or existing servers), open each tab and confirm:

| Screen | Look for |
| --- | --- |
| Dashboard | Dark panel on darker bg; no white cards |
| Jobs | Dark table header (`--raised`); selected row amber wash; dark buttons |
| Calculator | Dark inputs; amber active nav; tier tiles unchanged; profit colors readable |
| Countries | Dark form controls; country dropdown dark panel + amber hover |

If anything is still light/blue chrome (not tier tiles), fix in `index.css` and amend only if the previous commit is yours, unpushed, and hooks did not reject — otherwise make a new fix commit:

```bash
git add src/web/index.css
git commit -m "$(cat <<'EOF'
style: fix leftover light chrome in dark theme

EOF
)"
```

- [ ] **Step 3: Final leftover scan**

```bash
rg -n "#fff\b|#ffffff|#f3f4f6|#f8fafc|#dbeafe|#bfdbfe|#15803d|color-scheme: light" src/web/index.css
```

Expected: no matches (tier blues/greens in `.tier-tile--*` gradients may still match hex patterns like `#1d4ed8` / `#34d399` — those are OK; the listed light-chrome hexes must be gone).

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Dark token palette + `color-scheme: dark` | Task 1 |
| Amber accent / soft wash | Task 1 |
| Shell/nav active & hover | Task 1 |
| Pages use panel on bg | Task 1 (tokens) |
| Tables raised header + amber selected | Task 2 |
| Forms / country select dark | Task 2 |
| Buttons never white fill | Task 2 |
| Profit/error status colors | Task 2 |
| Tier tiles unchanged | Tasks 1–2 (do not edit `.tier-tile*`) |
| No light toggle / fonts / textures | All tasks (out of scope) |
| Visual + `vp check` | Task 3 |
