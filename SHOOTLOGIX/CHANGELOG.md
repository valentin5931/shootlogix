# CHANGELOG — ShootLogix

## 2026-03-23 — [P1] Add global error handler for database integrity errors

**Problem**: Any database integrity violation (invalid foreign key, duplicate unique value) caused a 500 Internal Server Error with a full Python traceback exposed to the client. This affected all CRUD endpoints — creating assignments with invalid boat/vehicle/function IDs, duplicate entries, etc. resulted in unhelpful error pages instead of clean JSON error messages.

**Root cause**: No global error handler for `sqlite3.IntegrityError`. The `create_*` functions in `database.py` don't catch exceptions, so integrity errors propagated to Flask's default 500 handler, leaking internal stack traces.

**Fix**:
- `app.py`: Added `import sqlite3` and a `@app.errorhandler(sqlite3.IntegrityError)` that returns clean JSON:
  - FK violations → 422 `{"error": "Referenced entity does not exist"}`
  - Unique violations → 409 `{"error": "A record with this value already exists"}`
  - Other → 422 `{"error": "Data integrity error"}`

**Verification**:
- FK violation (invalid boat_id=9999) returns 422 JSON (was 500 traceback)
- All 5 assignment endpoints tested: boats, picture-boats, security-boats, transport, helpers
- Valid CRUD operations still return 201/200 as expected
- No regressions on GET endpoints

**Branch**: fix/2026-03-23-integrity-error-handler
**PR**: #25
**Side effects**: None — only affects error responses, not success paths
**Next priority**: P1 — Picture Boats and Security Boats tables empty (data seeding issue); Labour worker list empty (helpers table not populated)

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
