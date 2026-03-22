# ShootLogix Changelog

## 2026-03-22 — [P0] Fix 5 broken tabs + documents API crash

**Problem**: Clicking on Fleet, Crew, Today, Documents, and Timeline tabs did nothing — no content loaded. Additionally, all 7 Documents API endpoints crashed with `AttributeError: '_GeneratorContextManager' object has no attribute 'execute'`.

**Root cause**:
1. The `setTab()` function in `app-monolith.js` had no handlers for `fleet`, `crew`, `today`, `documents`, or `timeline` tabs. These were planned as separate module files (`static/modules/`) but never integrated into the monolith.
2. All document API routes in `app.py` used `db = get_db()` instead of `with get_db() as db:` — `get_db()` is a generator/context manager that must be used with `with`.

**Fix**:
- `static/app-monolith.js`: Added render functions for all 5 missing tabs (`renderFleet`, `crewSetSubTab`, `renderToday`, `renderDocuments`, `renderTimeline`) plus helper functions, wired them into `setTab()`, and exported them.
- `app.py`: Fixed all 7 document routes (GET list, POST create, PUT update, DELETE, PUT status, GET versions, POST upload version) to use `with get_db() as db:` context manager pattern.

**Files changed**:
- `SHOOTLOGIX/static/app-monolith.js` — ~250 lines added (render functions + exports)
- `SHOOTLOGIX/app.py` — 7 routes fixed (get_db context manager)

**Verification**:
- All 45 existing tests pass
- `/api/productions/1/today` returns full daily overview
- `/api/productions/1/documents` returns valid JSON (was crashing before)
- All 5 tabs now have functional render handlers
- Fleet shows unified card view of all vessel categories
- Crew shows sub-tabs for Labour and Guards
- Today shows daily overview with date navigation
- Documents shows document list with upload capability
- Timeline shows basic Gantt-style production timeline

**Branch**: fix/2026-03-22-missing-tab-handlers
**Side effects**: None
**Next priority**: P0 — Test remaining tab interactions (adding/editing entities, modal forms) and check for more silent API failures
