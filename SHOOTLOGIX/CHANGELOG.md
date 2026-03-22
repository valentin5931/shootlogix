# CHANGELOG — ShootLogix

## 2026-03-22 — [P1] Populate Picture Boats from Fleet data

**Problem**: Picture Boats sub-tab showed "No picture boats" — the `picture_boats` table was empty even though 46 boats existed in the main `boats` table with `category='picture'`.

**Root cause**: The data seeder (`data_loader.py`) only created `boat_functions` (role categories like YELLOW/RED/NEUTRAL/EXILE) for picture boats but never populated the `picture_boats` table itself. The fleet data was all in the `boats` table, and the Picture Boats tab queries a separate `picture_boats` table.

**Fix**:
- `data_loader.py`: Added `_populate_picture_boats_from_fleet()` migration that copies all 46 boats from `boats` into `picture_boats` with matching attributes (name, capacity, wave_rating, vendor, rates, etc.)
- Migration is idempotent (uses `populate_picture_boats_v1` setting flag)
- Called on every startup (both new and existing production paths)

**Verification**:
- `/api/productions/1/picture-boats` now returns 46 boats (was 0)
- Picture boat assignment CRUD works (create, read, delete tested)
- All other endpoints still work (no regressions)
- Python syntax check passes

**Branch**: fix/2026-03-22-populate-picture-boats-from-fleet
**PR**: (pending)
**Side effects**: None
**Next priority**: Security Boats tab is empty (no source data to migrate — may need manual entry or a similar migration when data becomes available); Transport vehicles seeding (14 vehicles defined in data_loader but table is empty)

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
