# CHANGELOG — ShootLogix

## 2026-04-05 — [P0] Fix Timeline API crash — invalid column references in locations query

**Problem**: The Timeline (Gantt) API endpoint `/api/productions/<id>/timeline` crashed with HTTP 500: `sqlite3.OperationalError: no such column: site`. The Timeline tab was completely non-functional.

**Root cause**: The timeline route at `app.py:7893` referenced two non-existent columns:
1. `site` in the `locations` table — the correct column is `location_type`
2. `prep`, `filming`, `wrap` in the `location_schedules` table — this table uses a single `status` column with values 'P', 'F', 'W', and links to locations via `location_name` + `production_id`, not `location_id`

**Fix**:
- `app.py` line 7893: Changed `SELECT id, name, site` to `SELECT id, name, location_type`
- `app.py` line 7895-7904: Changed query from `SELECT id, date, prep, filming, wrap FROM location_schedules WHERE location_id=?` to `SELECT id, date, status FROM location_schedules WHERE location_name=? AND production_id=?`, and simplified the phase logic to use the `status` column directly
- `app.py` line 7912: Changed `loc['site']` to `loc['location_type']` for the subgroup field

**Verification**:
- Timeline API now returns 200 with 82 resources (47 boats, 14 vehicles, 21 locations)
- Location resources correctly show `location_type` as subgroup (e.g., "tribal_camp", "game", "reward")
- All 45 existing tests pass
- No regressions on Dashboard, Boats, Locations, Budget APIs

**Branch**: fix/2026-04-05-timeline-api-crash
**Side effects**: None
**Next priority**: P1 — Picture Boats and Security Boats tables are empty (boats exist only in main boats table)

## 2026-04-05 — [P0] Fix Timeline guard_camp_assignments query — wrong column name

**Problem**: The Timeline API's guard section queried `guard_camp_assignments WHERE worker_id=?` but the actual column is `helper_id`, causing a crash when guard data exists.

**Root cause**: The `api_timeline` function used `worker_id` instead of `helper_id` in the guard_camp_assignments query (line 7883).

**Fix**: Changed `WHERE worker_id=?` to `WHERE helper_id=?` in `app.py` line 7883.

**Verification**: Timeline endpoint returns 200 with all resource groups.

**Branch**: fix/2026-04-05-timeline-api-crash
**Side effects**: None
**Next priority**: Investigate 404s on Schedule, Labour, and Catering API endpoints

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
