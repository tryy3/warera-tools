# Economy Company Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse formula stacks into two independent native `<details>` drawers per company card, and fix stats gap, switch-line alignment, and Transfer gold wrapping.

**Architecture:** Keep all changes in `EconomyPage.tsx` + `index.css`. Introduce a small `FormulaDetails` wrapper around existing `FormulaBox` children. No advisor math, API, or persistence changes.

**Tech Stack:** React 19, plain CSS in Vite WebUI; verify with `vp check` + manual visual pass on Economy cards.

**Design:** [2026-08-01-economy-company-card-polish-design.md](../specs/2026-08-01-economy-company-card-polish-design.md)

## Global Constraints

- Native `<details>` / `<summary>` only — no React open-state, no expand-all
- Two independent drawers: **How calculated** (current) and **Switch math** (best switch)
- Both drawers start closed (omit `open` attribute)
- Reuse existing formula-box visual language for the details shell
- Do not change formula text or economy math
- Prefer `vp check` for verification; UI polish so no new unit tests required
- Commit after each task

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/web/features/economy/EconomyPage.tsx` | `FormulaDetails` helper; wrap formula groups; switch summary + Transfer markup |
| `src/web/index.css` | Stats column gap; `.formula-details` styles; switch summary flex; Transfer stack |

---

### Task 1: Formula drawers (markup + CSS)

**Files:**
- Modify: `src/web/features/economy/EconomyPage.tsx` (after `FormulaBox`, inside `CompanyCard`)
- Modify: `src/web/index.css` (near `.formula-box`)

**Interfaces:**
- Consumes: existing `FormulaBox`, `row.bonusDetails` / `profitBreakdown` / `aeBreakdown` / `bestSwitch`
- Produces: `function FormulaDetails({ label, children }: { label: string; children: React.ReactNode })`

- [ ] **Step 1: Add `FormulaDetails` helper**

In `EconomyPage.tsx`, immediately after `FormulaBox`:

```tsx
function FormulaDetails({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="formula-details">
      <summary className="formula-details-summary">{label}</summary>
      <div className="formula-details-body">{children}</div>
    </details>
  );
}
```

If `React` is not already in scope for `React.ReactNode`, import the type:

```tsx
import type { ReactNode } from "react";
```

and use `children: ReactNode` instead.

- [ ] **Step 2: Wrap current-company formulas**

Replace the three loose `FormulaBox` calls after the main stats `dl` with a single drawer that only renders when at least one formula exists:

```tsx
{row.bonusDetails || row.profitBreakdown || row.aeBreakdown ? (
  <FormulaDetails label="How calculated">
    {row.bonusDetails ? (
      <FormulaBox label="Production bonus">{row.bonusDetails.formula}</FormulaBox>
    ) : null}
    {row.profitBreakdown ? (
      <FormulaBox label="Profit / PP">{row.profitBreakdown.formula}</FormulaBox>
    ) : null}
    {row.aeBreakdown ? (
      <FormulaBox label="AE / day">{`${row.aeBreakdown.formula} = ${formatNum(row.aeBreakdown.dailyValue, 4)} G`}</FormulaBox>
    ) : null}
  </FormulaDetails>
) : null}
```

- [ ] **Step 3: Wrap switch formulas**

Inside `.economy-switch`, after the compact stats `dl`, replace the four loose switch `FormulaBox`es with:

```tsx
<FormulaDetails label="Switch math">
  <FormulaBox label="Alt Profit / PP">{row.bestSwitch.profitFormula}</FormulaBox>
  <FormulaBox label="Alt AE / day">{row.bestSwitch.aeFormula}</FormulaBox>
  <FormulaBox label="Transfer cost">{row.bestSwitch.transferFormula}</FormulaBox>
  {row.bestSwitch.paybackFormula ? (
    <FormulaBox label="Payback">{row.bestSwitch.paybackFormula}</FormulaBox>
  ) : null}
</FormulaDetails>
```

Do not put a second “expand all” control on the card. Leave the two drawers independent.

- [ ] **Step 4: Style `.formula-details`**

In `src/web/index.css`, add after `.formula-box` (or adjacent):

```css
.formula-details {
  margin-top: 0.55rem;
  padding: 0.35rem 0.55rem 0.45rem;
  border: 1px dashed rgba(232, 165, 75, 0.35);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
}

.formula-details-summary {
  cursor: pointer;
  font-size: 0.75em;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent);
  list-style: none;
}

.formula-details-summary::-webkit-details-marker {
  display: none;
}

.formula-details-summary::before {
  content: "▸ ";
  display: inline-block;
  transition: transform 0.12s ease;
}

.formula-details[open] > .formula-details-summary::before {
  transform: rotate(90deg);
}

.formula-details-body .formula-box {
  margin-top: 0.45rem;
}

.formula-details-body .formula-box:first-child {
  margin-top: 0.35rem;
}
```

Inside an open drawer, nested `.formula-box` borders may look busy. Prefer leaving them as-is for this task; only remove nested box borders if the visual pass in Task 3 shows clutter (YAGNI until then).

- [ ] **Step 5: Smoke-check drawers exist**

Run:

```bash
rg -n "FormulaDetails|How calculated|Switch math|formula-details" src/web/features/economy/EconomyPage.tsx src/web/index.css
```

Expected: helper + both labels in TSX; `.formula-details` rules in CSS. No `open` attribute on `<details>`.

- [ ] **Step 6: Commit**

```bash
git add src/web/features/economy/EconomyPage.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
feat: collapse company formula stacks into details drawers

EOF
)"
```

---

### Task 2: Stats gap, switch alignment, Transfer stack

**Files:**
- Modify: `src/web/index.css` (`.economy-stats`, `.economy-switch*`)
- Modify: `src/web/features/economy/EconomyPage.tsx` (switch summary + Transfer `dd`)

**Interfaces:**
- Consumes: Task 1 `CompanyCard` structure
- Produces: updated markup/CSS only (no new exports)

- [ ] **Step 1: Bump stats column gap**

In `src/web/index.css`, change:

```css
.economy-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 0.45rem 0.9rem;
  margin: 0;
}
```

(Previous column gap was `0.75rem`; row gap stays `0.45rem`.)

- [ ] **Step 2: Replace switch summary `<p>` with aligned row**

In `CompanyCard`, replace the best-switch `<p>...</p>` with:

```tsx
<div className="economy-switch-summary">
  <span className="economy-switch-arrow">→</span>
  <span className="icon-label">
    <ItemIcon itemCode={row.bestSwitch.itemCode} />
    <strong>{formatItem(row.bestSwitch.itemCode)}</strong>
  </span>
  {row.bestSwitch.bestRegionName || row.bestSwitch.bestRegionId ? (
    <>
      <span className="economy-switch-at">@</span>
      <span className="icon-label">
        <FlagIcon code={row.bestSwitch.bestRegionCountryCode} />
        {row.bestSwitch.bestRegionName ?? row.bestSwitch.bestRegionId}
      </span>
    </>
  ) : (
    <span>(same region)</span>
  )}
  <span className="economy-switch-bonus">
    (+{formatNum(row.bestSwitch.bestBonus * 100, 1)}% bonus)
  </span>
</div>
```

Add CSS (replace or keep `.economy-switch p` unused — delete the `p` rule if unused):

```css
.economy-switch-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.45rem;
  margin: 0 0 0.35rem;
  font-size: 0.95em;
  line-height: 1.3;
}

.economy-switch-arrow,
.economy-switch-at {
  color: var(--muted);
}

.economy-switch-bonus {
  color: var(--muted);
}
```

- [ ] **Step 3: Stack Transfer gold under Concrete**

Replace the Transfer `dd` with:

```tsx
<dd className="economy-transfer">
  <span>
    {row.bestSwitch.transferConcrete} Concrete
  </span>
  <span className="economy-transfer-gold">
    ~ <GoldAmount value={row.bestSwitch.transferGold} digits={1} />
  </span>
</dd>
```

Add CSS:

```css
.economy-transfer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}

.economy-transfer-gold {
  color: var(--muted);
  font-size: 0.92em;
}
```

- [ ] **Step 4: Smoke-check polish selectors**

Run:

```bash
rg -n "gap: 0.45rem 0.9rem|economy-switch-summary|economy-transfer" src/web/index.css src/web/features/economy/EconomyPage.tsx
```

Expected: column gap `0.9rem`; summary + transfer classes in both files. Old inline `(~…)` Transfer string gone.

- [ ] **Step 5: Commit**

```bash
git add src/web/features/economy/EconomyPage.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
style: tighten company card stats spacing and switch layout

EOF
)"
```

---

### Task 3: Verification

**Files:**
- Verify only: `src/web/features/economy/EconomyPage.tsx`, `src/web/index.css` (edit only if a check fails)

**Interfaces:**
- Consumes: Tasks 1–2 complete
- Produces: confirmed polish + green `vp check`

- [ ] **Step 1: Run check**

```bash
vp check
```

Expected: exit 0 (format/lint/types clean).

- [ ] **Step 2: Visual pass on Economy page**

With `vp run dev` (or existing server) and a user that has companies + a best switch:

1. Default card: formulas hidden; only **How calculated** / **Switch math** summaries visible
2. Open **How calculated** alone → current formulas only; switch drawer stays closed
3. Open **Switch math** alone → switch formulas only
4. Main stats columns have a slightly wider horizontal gap
5. Switch summary icons/text share one horizontal baseline
6. Transfer shows Concrete on line 1 and `~` gold on line 2

- [ ] **Step 3: Final structure guard**

```bash
rg -n "<details|How calculated|Switch math|economy-switch-summary|economy-transfer" src/web/features/economy/EconomyPage.tsx
rg -n "open=" src/web/features/economy/EconomyPage.tsx
```

Expected: details present with both labels; second command finds no `open=` forcing drawers open.

- [ ] **Step 4: Commit only if Step 1–3 required fixes**

If no further edits, skip. Otherwise commit the fix:

```bash
git add src/web/features/economy/EconomyPage.tsx src/web/index.css
git commit -m "$(cat <<'EOF'
fix: finish company card polish after visual check

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Native `<details>`, closed by default | Task 1 |
| **How calculated** drawer for current formulas | Task 1 |
| **Switch math** drawer for switch formulas | Task 1 |
| Independent drawers / no expand-all | Task 1 |
| Formula visual language on details shell | Task 1 |
| Stats column gap ~0.9rem | Task 2 |
| Switch summary horizontal alignment | Task 2 |
| Transfer gold on new line | Task 2 |
| No math/API/persistence changes | Tasks 1–2 (out of scope) |
| Visual + `vp check` | Task 3 |
