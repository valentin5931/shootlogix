# CHANGELOG — ShootLogix

## 2026-04-05 — [P1] Fix Timeline tab — completely non-functional due to 3 bugs

**Problem**: Clicking the Timeline tab did nothing. The Gantt timeline view was completely broken.

**Root cause**: Three separate bugs:
1. `timeline.js` loads before `app-monolith.js`, so `App` is undefined when it tries to register `App.renderTimeline`. The registration silently fails.
2. `timeline.js` used `window._SL.state.prodId` to get the production ID, but `window._SL` doesn't exist in the monolith architecture. It uses `localStorage.getItem('currentProdId')`.
3. `timeline.js` used `localStorage.getItem('sl_token')` for auth, but the monolith stores the token as `access_token`.
4. The `/api/productions/<id>/timeline` Flask route crashed with 500 errors due to two wrong column names: `site` (should be `location_type`) in the locations query and `prep/filming/wrap` (should be `status`) in the location_schedules query. The location_schedules schema stores one row per date/status, not boolean columns.

**Fix**:
- `static/app-monolith.js` (line 1362): Call `Timeline.init()` directly instead of relying on `App.renderTimeline` registration
- `static/js/timeline.js`: Deferred `App.renderTimeline` registration to `DOMContentLoaded`; changed `window._SL.state.prodId` to `localStorage.getItem('currentProdId')`; changed `sl_token` to `access_token`
- `app.py` (line ~7893): Fixed locations query to use `location_type` instead of `site`; rewrote location_schedules query to match actual schema (single `status` column with 'P'/'F'/'W' values, grouped by date)

**Verification**:
- `/api/productions/1/timeline` now returns 200 with 82 resources (47 boats, 14 vehicles, 21 locations), 32 shooting days
- All 45 existing tests still pass
- All other API endpoints verified (dashboard, boats, budget, PDT, locations, exports — all 200)
- JS syntax check passes (balanced braces/parens)

**Branch**: fix/2026-04-05-timeline-tab-broken
**Side effects**: None
**Next priority**: The P0 about fleet/crew sub-tab event handlers in ISSUES.md may be resolved (needs browser testing). Remaining P1s are empty data tables (picture boats, security boats, transport, helpers, guards, FNB — users need to add data through UI).

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
