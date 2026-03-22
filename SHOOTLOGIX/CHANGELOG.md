# CHANGELOG — ShootLogix

## 2026-03-22 — [P0] Fix 5 broken tabs (Fleet, Crew, Today, Documents, Timeline) + 2 backend crashes

**Problem**: 5 tabs (Fleet, Crew, Today, Documents, Timeline) were completely non-functional — clicking them showed empty panels. Additionally, all 7 document API routes crashed with 500 errors, and the timeline API crashed due to referencing non-existent database columns.

**Root cause**:
1. `setTab()` in `app-monolith.js` had no handlers for fleet, crew, today, documents, or timeline tabs — the panels were shown via CSS but no render function was called
2. All document API routes used `db = get_db()` instead of `with get_db() as db:` — since `get_db()` is a generator, this returned the generator object instead of a DB connection
3. Timeline endpoint queried `locations.site` (doesn't exist, should be `location_type`) and `location_schedules.prep/filming/wrap` (don't exist, table uses `status`)

**Fix**:
- `SHOOTLOGIX/static/app-monolith.js`: Added 5 new render functions and setTab handlers for fleet/crew/today/documents/timeline
- `SHOOTLOGIX/app.py`: Fixed 7 document routes to use context manager; fixed 2 timeline SQL queries

**Verification**: All 15 major API endpoints return HTTP 200. JS braces balanced. App starts without errors.

**Branch**: fix/2026-03-22-p0-broken-tabs-and-backend-crashes
**PR**: #9
**Side effects**: None
**Next priority**: P0 — Test UI rendering in browser; verify picture-boats and security-boats data shows up (currently empty arrays — may need data seeding or investigation)
