# CHANGELOG — ShootLogix

## 2026-04-13 — [P1] Fix Fleet/Crew sub-tab context: FAB, _tabCtx, pull-to-refresh

**Problem**: When navigating to Fleet or Crew tabs, three things were broken:
1. The FAB (floating action button) disappeared on mobile — users couldn't add boats, picture boats, security boats, workers, or guards via the FAB
2. `_tabCtx` was not set for Security Boats or Guards sub-tabs, causing the assign modal to use wrong context/function arrays
3. Pull-to-refresh did nothing on Fleet/Crew sub-tabs because `_reloadCurrentTab()` checked `state.tab` which was 'fleet'/'crew' (not the sub-tab name)

**Root cause**: `state.tab` is set to 'fleet' or 'crew' when those tabs are opened, but FAB_CONFIG, fabAction(), and _reloadCurrentTab() all expected the sub-tab name ('boats', 'picture-boats', 'security-boats', 'labour', 'guards'). Additionally, `renderFleetUnified()` and `renderCrewUnified()` didn't set `_tabCtx` for security boats and guards sub-tabs.

**Fix** (`static/app-monolith.js`):
- Added `_effectiveTab()` helper that resolves 'fleet' → active fleet sub-tab and 'crew' → active crew sub-tab
- Updated `_updateFab()` and `fabAction()` to use `_effectiveTab()` instead of `state.tab`
- Updated `_reloadCurrentTab()` to use `_effectiveTab()` for correct pull-to-refresh behavior
- Set `_tabCtx = 'security'` in `renderFleetUnified()` and `setTab()` for security-boats
- Set `_tabCtx = 'guard_camp'` in `renderCrewUnified()` and `setTab()` for guards
- Added `_updateFab()` calls inside `renderFleetUnified()` and `renderCrewUnified()` so FAB updates on sub-tab switch
- Added 'today' and 'documents' to `_reloadCurrentTab()` coverage

**Verification**:
- All 45 tests pass
- JS bracket balance verified (0 difference)
- App starts without errors
- Updated JS is served correctly

**Branch**: fix/2026-04-13-fleet-crew-subtab-context
**Side effects**: None
**Next priority**: Add confirmation dialogs for destructive delete operations (P1 — boats, assignments, functions, workers)

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
