# CHANGELOG — ShootLogix

## 2026-03-22 — [P0] Fix Timeline API crash — 3 wrong column references

**Problem**: The `/api/productions/:id/timeline` endpoint crashed with 500 `sqlite3.OperationalError` every time it was called.

**Root cause**: The timeline query referenced 3 columns that don't exist in the actual database schema:
1. `locations.site` — doesn't exist (actual columns: `type`, `location_type`)
2. `location_schedules.prep/filming/wrap` — don't exist (actual: single `status` column with P/F/W values)
3. `guard_camp_assignments.worker_id` — doesn't exist (actual: `helper_id`)

**Fix**:
- `app.py` (lines ~7893-7914): Rewrote the Locations and Guards sections of `api_timeline()` to match actual schema

**Verification**:
- Timeline endpoint returns 200 with 81 resources and 32 shooting days (was 500)
- Location resources show correct subgroups from `location_type`
- No regressions on other endpoints

**Branch**: fix/2026-03-22-timeline-no-such-column-site
**PR**: #21
**Side effects**: None
**Next priority**: P1 issues — Picture Boats and Security Boats lists empty; Transport/Helpers/Guards lists empty (no data seeded)

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
