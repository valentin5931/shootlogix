# CHANGELOG — ShootLogix

## 2026-03-22 — [P0] Fix Timeline API crash — wrong column names in SQL queries

**Problem**: The `/api/productions/{id}/timeline` endpoint returned a 500 error (`sqlite3.OperationalError`), making the Timeline tab completely non-functional.

**Root cause**: Three SQL queries in `api_timeline()` referenced columns that don't exist in the actual database schema:
1. `SELECT id, name, site FROM locations` — `site` column doesn't exist (should be `location_type`)
2. `SELECT id, date, prep, filming, wrap FROM location_schedules` — `prep`/`filming`/`wrap` columns don't exist (the table uses a single `status` column with values like 'F', 'P', 'W')
3. `WHERE worker_id=?` in `guard_camp_assignments` — column is actually `helper_id`

**Fix**:
- `app.py` line 7893: Changed `site` → `location_type` in locations query
- `app.py` lines 7896-7908: Rewrote location_schedules query to use `status` column instead of `prep`/`filming`/`wrap`
- `app.py` line 7883: Changed `worker_id` → `helper_id` in guard_camp_assignments query

**Verification**:
- Timeline API now returns 200 with 81 resources and 32 shooting days
- All other endpoints still return 200 (no regressions)
- Python syntax check passes

**Branch**: fix/2026-03-22-timeline-api-crash
**PR**: #15
**Side effects**: None
**Next priority**: P1 issues — empty picture-boats, security-boats, transport, guards lists

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

## 2026-03-22 — [P0] Fix Timeline API crash — wrong column names in SQL

**Problem**: The `/api/productions/:id/timeline` endpoint crashed with `sqlite3.OperationalError: no such column: site` (HTTP 500).

**Root cause**: The timeline endpoint's SQL queries referenced non-existent columns:
- `locations.site` (actual column: `location_type`)
- `location_schedules.prep`, `.filming`, `.wrap` (actual column: `status` with values like 'P', 'F', 'W')

**Fix**: `app.py` line ~7893: Updated SQL queries to use correct column names and adjusted the phase-building logic to work with the single `status` column.

**Verification**:
- Timeline returns 200 with 81 resources, 121 functions
- All 45 tests pass
- All other endpoints unaffected

**Branch**: fix/2026-03-22-timeline-api-crash
**Side effects**: None
**Next priority**: P1 UX issues — 16 duplicate PRs cleaned up, all P0 backend crashes resolved
