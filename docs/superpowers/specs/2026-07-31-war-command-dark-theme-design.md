# War-Command Dark Theme — Design

**Date:** 2026-07-31  
**Status:** Approved for implementation planning  
**Scope:** Dark-only WebUI theme polish via CSS tokens in `src/web/index.css`  
**Depends on:** [WarEra Toolkit Foundation](./2026-07-31-warera-toolkit-foundation-design.md)

## Goal

Replace the light slate/blue utility theme with a dark-ish “war-command” look inspired by WarEra: near-black warm surfaces, amber accents, and coherent form/table/nav states — without redesigning layout or adding a theme toggle.

## Decisions

| Topic | Choice |
| --- | --- |
| Mood | War-command dark (near-black, warm neutrals, amber accent) |
| Depth | Tokens + light polish (not token-swap-only; not full atmosphere/typography restyle) |
| Accent | Warm amber/gold for links, active nav, focus/selected washes |
| Mode | Dark-only; set `color-scheme: dark`; no light/dark toggle |
| Approach | Expand semantic CSS variables; eliminate hardcoded light colors in WebUI CSS |
| Layout / React | Unchanged unless a class needs a token hook (prefer CSS-only) |
| Tier tiles | Leave existing dark gradients/selection ring as-is |
| Fonts | Keep current `--sans` / `--mono` stacks |

## Palette & tokens

Define (or retune) these on `:root` in `src/web/index.css`:

| Token | Role | Value |
| --- | --- | --- |
| `--bg` | App chrome / shell background | `#12100e` |
| `--panel` | Header, page, primary surfaces | `#1a1714` |
| `--raised` | Table headers, hover rows, elevated controls | `#24201c` |
| `--border` | Dividers, input/button borders | `#3a342e` |
| `--text` | Primary text | `#f0ebe6` |
| `--muted` | Secondary labels / helper text | `#9a9086` |
| `--accent` | Links, active nav, emphasis | `#e8a54b` |
| `--accent-soft` | Active/selected wash | `rgba(232, 165, 75, 0.16)` |
| `--error` | Errors / negative profit | `#f07178` (or equivalent dark-readable red) |
| `--success` | Positive profit (new token if useful) | `#6bbf8a` (or equivalent dark-readable green) |

Implementers may nudge hex values slightly for contrast, but must keep warm-neutral + amber character.

Also:

- `:root { color-scheme: dark; }`
- Prefer tokens everywhere; avoid leftover `#fff`, `#f3f4f6`, `#f8fafc`, light blue accent washes

## Surfaces & components

All styling changes target `src/web/index.css`.

### Shell

- Header: `--panel` background, `--border` bottom edge
- Brand: keep text treatment; use `--text`
- Nav inactive: `--muted`; hover → `--text` on `--raised`
- Nav active: `--accent` text + `--accent-soft` background; border tinted toward accent (not light blue)

### Pages

- `.page` on `--panel` with `--border`; sits over darker `--bg`
- Headings/body use `--text`; helpers use `.muted` / `--muted`

### Tables (Jobs / Countries)

- Header cells: `--raised` background
- Borders: `--border`
- Selected row: soft amber wash (`--accent-soft`), not light gray

### Forms & country select

- Inputs, selects, triggers: dark surface (`--panel` or `--raised`), `--text`, `--border`
- Dropdown list: dark panel, `--border`, soft shadow OK (dark translucent, not light slate)
- Hover / selected list items: `--accent-soft` (not light blue wash)
- Buttons: dark raised + border; hover strengthens border toward muted/amber — never white fill

### Status colors

- `.profit-positive` → `--success` (or retuned green)
- `.profit-negative` / `.error` → `--error`

### Tier tiles

- Unchanged (already dark game-like tiles)

## Out of scope

- Light mode / theme toggle
- New fonts or display typography
- Background textures, hero imagery, motion systems
- Shared component library / design-token package
- Changing Calculator/Jobs/Countries React structure or behavior
- Matching official WarEra CSS variables 1:1 (inspired by, not a port)

## Verification

- Visual pass: Dashboard, Jobs, Calculator, Countries — no white/light leftover panels or blue accent chips
- Inputs, country dropdown, tier tiles remain usable and readable
- Active nav and links read as amber
- Positive/negative profit remain distinguishable
- `vp check` / existing unit tests still pass (CSS-only; no logic changes expected)

## Non-goals

- Pixel-perfect clone of warera.io
- Accessibility audit beyond keeping readable contrast for primary text/controls
