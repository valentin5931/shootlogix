# CHANGELOG — ShootLogix

## 2026-04-02 — [P1] Add loading states and error handling to Guards, Locations, and Fuel tabs

**Problem**: Guards (Location Guards sub-tab), Locations, and Fuel tabs showed a blank screen with no loading feedback while data was being fetched. Error responses from the API were silently swallowed, leaving users with no indication of what went wrong. The `deleteFuelMachinery` function had no error handling — a failed delete would still remove the item from the UI, causing data inconsistency.

**Root cause**: Several async render functions (`renderGuardLocation`, `renderLocations`) performed multiple sequential API calls without showing a loading skeleton or displaying error toasts on failure. `renderGuards()` had empty `.catch(() => {})` blocks. `deleteFuelMachinery()` lacked a try/catch wrapper. `_loadAndRenderFuel()` called `_loadFuelGlobals()` without try/catch, causing the entire fuel tab to hang on the skeleton if that call failed.

**Fix**:
- `static/app-monolith.js`: `renderGuardLocation()` — added loading skeleton before API calls; added error toasts on catch blocks
- `static/app-monolith.js`: `renderLocations()` — added loading skeleton when data needs loading; added error toasts on catch blocks
- `static/app-monolith.js`: `renderGuards()` — replaced silent `.catch(() => {})` with `console.warn`; wrapped both sub-tab awaits in try/catch with error toasts
- `static/app-monolith.js`: `deleteFuelMachinery()` — wrapped API call in try/catch with error toast
- `static/app-monolith.js`: `_loadAndRenderFuel()` — wrapped `_loadFuelGlobals()` in try/catch to prevent skeleton freeze

**Verification**:
- All affected tabs still load correctly (200 on all API endpoints)
- JS brace/paren balance: 0 delta (no syntax errors)
- Loading skeletons now appear before data loads
- Error messages now display to users on API failure

**Branch**: fix/2026-04-02-loading-states-error-handling
**Side effects**: None
**Next priority**: Continue through P1 UX anomalies — check remaining tabs for similar missing loading states and error handling gaps

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
