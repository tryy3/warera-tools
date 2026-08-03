# SkillRail action hierarchy

**Date:** 2026-08-03  
**Status:** Approved for implementation

## Goal

Make Optimize the primary SkillRail actions. Demote draft restore/reset so they don’t compete with optimize for attention, and shorten labels.

## Layout

### Header (next to “Points to spend”)

- Compact **Reset** control: small button with `RotateCcw` icon + label `Reset`.
- Behavior unchanged from today’s “Full reset”: zero eco skill levels and open the full SP pool (`fullResetDraft`).

### Footer

1. Primary row — two colored buttons:
   - `Optimize unspent`
   - `Optimize reset` (was “Optimize full reset”)
2. Secondary — centered text link:
   - `Restore` (was “Restore to current state”) — cheap local rewind to last loaded bootstrap.

### Removed from footer

- Full-width ghost buttons for Restore / Full reset.

## Out of scope

- Removing Restore in favor of shell Refresh only (kept as text link).
- Changing optimize algorithms or draft math.
