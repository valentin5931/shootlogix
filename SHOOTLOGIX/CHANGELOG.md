# CHANGELOG — ShootLogix

## 2026-04-02 — [P1] Fix guard camp assignment endpoint + export menu close + silent error feedback

**Problem**:
1. `_getAssignmentEndpoint()` returned wrong API endpoint for guard camp assignments — both `helper_assignments` and `guard_camp_assignments` have a `helper_id` field, so gc assignments matched the helper-assignments check first, routing schedule operations to the wrong API endpoint.
2. Security Boats and Guard Camp export dropdown menus didn't close when clicking outside (unlike Boats, Picture Boats, Transport, Labour, and Fuel which all had close handlers).
3. `_clearDayOverride()` silently swallowed API errors with `catch (e) { /* silent */ }`, giving users no feedback when a schedule override failed to save.

**Root cause**:
- `_getAssignmentEndpoint` relied on field-name heuristics (`helper_id`, `boat_id`, etc.) to determine assignment type, but gc assignments and helper assignments share the same `helper_id` field name.
- The global click-outside handler for export menus was missing entries for `sb-export-wrap` and `gc-export-wrap`.
- The error catch in `_clearDayOverride` was deliberately silent — likely an oversight from initial implementation.

**Fix**:
- `static/app-monolith.js`: Restructured `_clearDayOverride()` to track which state array (`state.gcAssignments`, `state.labourAssignments`, etc.) the assignment was found in, passing a `source` parameter to `_getAssignmentEndpoint()`. Added `source === 'gc'` check before the `helper_id` heuristic. Added toast error feedback in catch block. Added `sb-export-wrap` and `gc-export-wrap` to the click-outside close handler.

**Verification**:
- JS syntax check passes (`node --check`)
- App starts without errors
- All existing API endpoints return correct data (47 boats, 73 helper assignments, 26 boat assignments)
- app-monolith.js loads successfully (634KB)

**Branch**: fix/2026-04-02-assignment-endpoint-and-ux-fixes
**Side effects**: None
**Next priority**: P1 — Picture Boats and Security Boats tables are empty (data architecture issue: all boats are in main boats table)

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
