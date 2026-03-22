# CHANGELOG — ShootLogix

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
