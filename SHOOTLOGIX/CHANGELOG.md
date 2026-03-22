# CHANGELOG — ShootLogix

## 2026-03-22 — [P0] Fix Timeline API 500 crash — missing columns in SQL queries

**Problem**: The Timeline API endpoint (`/api/productions/<id>/timeline`) crashed with a 500 error: `sqlite3.OperationalError: no such column: site`.

**Root cause**: The timeline aggregation query at line 7893 of `app.py` referenced two sets of nonexistent columns:
1. `locations.site` — this column doesn't exist; the correct column is `location_type`
2. `location_schedules.prep`, `location_schedules.filming`, `location_schedules.wrap` — these boolean columns don't exist; the actual schema uses a single `status` column with values like 'P', 'F', 'W'

**Fix**:
- `app.py` (line 7893): Changed `SELECT id, name, site` to `SELECT id, name, location_type`
- `app.py` (line 7895): Changed `SELECT id, date, prep, filming, wrap` to `SELECT id, date, status`
- Updated the phase extraction logic to read from the `status` column instead of individual boolean columns
- Updated the `subgroup` field to use `location_type` instead of `site`

**Verification**:
- Timeline API now returns HTTP 200 with 81 resources (46 boats, 14 vehicles, 21 locations)
- 32 shooting days returned correctly
- All other API endpoints still work (no regressions)
- Python syntax check passes

**Branch**: fix/2026-03-22-timeline-api-crash-missing-columns
**PR**: #18
**Side effects**: None
**Next priority**: P1 — Picture Boats and Security Boats lists are empty (data model investigation needed)

---

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
