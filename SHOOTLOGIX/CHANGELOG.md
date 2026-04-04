# CHANGELOG — ShootLogix

## 2026-04-04 — [P0] Fix Picture Boats state variable mismatch + missing data reload

**Problem**:
1. Pull-to-refresh on the Picture Boats tab stored data in wrong state variables (`state.pbFunctions`/`state.pbAssignments` instead of `state.pictureFunctions`/`state.pictureAssignments`), causing the tab to render stale/empty data after refresh.
2. Switching to Picture Boats via Fleet sub-nav called `renderPictureBoats()` without reloading data first, unlike Security Boats which correctly calls `_loadAndRenderSecurityBoats()`.
3. `_findAssignment()` referenced 3 non-existent state variables (`state.pbAssignments`, `state.sbAssignments`, `state.helperAssignments`), causing assignment lookups to silently skip Picture Boats, Security Boats, and Labour assignments.

**Root cause**:
- When Picture Boats rendering was added, the `_reloadCurrentTab()` function used shorthand variable names (`pb*`/`sb*`) that didn't match the canonical names used everywhere else (`picture*`/`security*`/`labour*`).
- The fleet sub-tab switching for Picture Boats was missing the `_loadAndRender*()` wrapper that Security Boats and other tabs have.

**Fix**:
- `static/app-monolith.js`: Created `_loadAndRenderPictureBoats()` async function (loads data with skeleton states, then renders) — mirrors `_loadAndRenderSecurityBoats()`.
- `renderFleetUnified()` now calls `_loadAndRenderPictureBoats()` instead of `renderPictureBoats()` directly.
- `setTab('picture-boats')` now calls `_loadAndRenderPictureBoats()`.
- `_reloadCurrentTab()` now delegates to `_loadAndRenderPictureBoats()` instead of inline code with wrong variable names.
- `_findAssignment()` fixed: `state.pbAssignments` -> `state.pictureAssignments`, `state.sbAssignments` -> `state.securityAssignments`, `state.helperAssignments` -> `state.labourAssignments`.

**Verification**:
- JS syntax check passes
- All API endpoints return 200
- Picture Boats data is now correctly reloaded when switching tabs or pulling to refresh
- `_findAssignment()` now correctly searches all assignment arrays

**Branch**: fix/2026-04-04-picture-boats-state-mismatch
**Side effects**: None
**Next priority**: Picture Boats and Security Boats tables are empty (P1 data issue — functions exist but no boat entities seeded)

## 2026-03-23 — [P0/P1] Fix fleet/crew sub-nav layout overflow + missing CSS variables

**Problem**:
1. Fleet (Boats/Picture Boats/Security Boats) and Crew (Labor/Guards) sub-navs are injected by prepending into the target view panels. The layout divs inside (`#boats-layout`, `#pb-boats-layout`, `#sb-boats-layout`, `#lb-layout`, `#gc-layout`) use hardcoded `height: calc(100vh - 48px - 2.5rem)` which doesn't account for the sub-nav height (~37px), causing all sidebar/main content to overflow and be cut off at the bottom.
2. `--bg-2` CSS variable used in 13+ inline JS-rendered elements (Today tab, Documents, etc.) was never defined, causing all those elements to render with transparent backgrounds — making text float on nothing.
3. `--blue` CSS variable used in the dashboard burn chart and legend was also undefined, making chart lines invisible.
4. Fleet/Crew breadcrumb always showed "Overview" regardless of which sub-tab was active.

**Root cause**:
- The sub-nav injection approach (prepend into view panels) was added in a previous session but height calculations were never updated to compensate.
- `--bg-2` and `--blue` were used as CSS vars in the JS template strings but never added to the `:root` declarations in `style.css`.

**Fix**:
- `static/style.css`: Added `--subnav-bar-h: 0px` to `:root`. Changed all 5 layout div height calculations to `calc(100vh - 48px - 2.5rem - var(--subnav-bar-h))`. Added `--bg-2` (`#131929` dark / `#F1F5F9` light) and `--blue` (`#3B82F6`) to both `:root` and `[data-theme="light"]`.
- `static/app-monolith.js`: `renderFleetUnified()` and `renderCrewUnified()` now set `--subnav-bar-h` to the measured sub-nav height after injecting it. `setTab()` resets `--subnav-bar-h` to `0px` when switching to non-fleet/non-crew tabs. Fleet/crew sub-tab switches now update the breadcrumb correctly.

**Verification**:
- Fleet > Boats/Picture Boats/Security Boats: sidebar and main content fill the panel correctly, sub-nav visible at top.
- Crew > Labor/Guards: same.
- Today tab: date input and boat cards now have visible background color.
- Dashboard burn chart: line now visible in blue.
- Breadcrumb shows "Fleet › Boats", "Fleet › Picture Boats", "Crew › Labor", "Crew › Guards" etc.
- JS syntax check passes.

**Branch**: claude/fix-display-issues-q03dh
**Side effects**: None
**Next priority**: Test Picture Boats and Security Boats empty list issue (P1)

## 2026-03-22 — [P0] Fix 5 broken tabs (Fleet, Crew, Today, Documents, Timeline) + Documents API crash

**Problem**: Fleet, Crew, Today, Documents, and Timeline tabs did nothing when clicked. Additionally, all Documents API endpoints crashed with a 500 error.

**Root cause**:
1. The `setTab()` function in `app-monolith.js` had no handlers for fleet, crew, today, documents, or timeline tabs. Module files existed in `static/modules/` but were never loaded — they relied on a `window._SL` module system that doesn't exist in the monolith architecture.
2. All 7 Documents API endpoints in `app.py` used `db = get_db()` instead of `with get_db() as db:`, causing `AttributeError: '_GeneratorContextManager' object has no attribute 'execute'`.

**Fix**:
- `static/app-monolith.js`: Added setTab handlers and render functions for all 5 tabs (fleet sub-nav, crew sub-nav, today dashboard, documents CRUD, timeline hookup)
- `app.py` (lines 7402-7555): Fixed all 7 Documents endpoints to use `with get_db() as db:` context manager

**Verification**:
- All 5 tabs now render content when clicked
- Documents API returns 200 (was 500)
- All existing tabs still work (no regressions)
- JS syntax check passes

**Branch**: fix/2026-03-22-fleet-crew-today-docs-tabs-broken
**PR**: #14
**Side effects**: None
**Next priority**: Test fleet/crew sub-tab navigation thoroughly; remaining P0 items from CLAUDE.md checklist (modal/form submissions, entity CRUD operations)
