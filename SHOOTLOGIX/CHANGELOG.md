# CHANGELOG — ShootLogix

## 2026-04-10 — [P0] Fix Timeline API crash — 3 SQL column mismatches + soft-delete filter

**Problem**: The Timeline tab (`/api/productions/<id>/timeline`) returned a 500 error, completely breaking the Gantt timeline view. Three separate SQL column references pointed to columns that don't exist in the database schema.

**Root cause**: The `api_timeline()` function was written with assumed column names that don't match the actual database schema:
1. `guard_camp_assignments.worker_id` → actual column is `helper_id`
2. `locations.site` → actual column is `location_type`
3. `location_schedules.prep/filming/wrap` → these boolean columns don't exist; the table uses a single `status` column with values like `'P'`, `'F'`, `'W'`

Additionally, none of the entity queries filtered out soft-deleted records (`deleted_at IS NOT NULL`), so deleted boats, vehicles, helpers, etc. appeared in the timeline.

A secondary fix in `database.py` corrected the `_NAME_FIELDS` mapping for `guard_camp_assignments` which referenced non-existent `worker_name_override` and `worker_id` columns (used for history/audit trail entity name extraction).

**Fix**:
- `app.py` (line 7883): Changed `WHERE worker_id=?` to `WHERE helper_id=?`
- `app.py` (line 7893): Changed `SELECT id, name, site` to `SELECT id, name, location_type`; replaced `loc['site']` with `loc['location_type']`
- `app.py` (lines 7895-7906): Replaced `SELECT id, date, prep, filming, wrap` with `SELECT id, date, status` and simplified phase extraction to use the single `status` column
- `app.py` (7 entity queries): Added `AND deleted_at IS NULL` filter to boats, picture_boats, security_boats, transport_vehicles, helpers, guard_camp_workers, and locations queries
- `database.py` (line 63): Changed `["worker_name_override", "worker_id"]` to `["helper_name_override", "helper_id"]`

**Verification**:
- Timeline endpoint returns 200 (was 500)
- Response contains 81 resources: 46 boats, 14 vehicles, 21 locations
- Soft-deleted test entities are properly excluded
- All 20+ API endpoints pass regression test (200 OK)
- Python syntax check passes

**Branch**: fix/2026-04-10-timeline-api-crash-worker-id
**Side effects**: None
**Next priority**: P1 — Picture Boats and Security Boats empty lists (all 46 boats are in main `boats` table with category "picture", not in `picture_boats`/`security_boats` tables)

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
