# CHANGELOG — ShootLogix

## 2026-03-22 — [P1] Seed picture_boats and security_boats tables from main fleet

**Problem**: The Picture Boats and Security Boats tabs showed empty lists. The API endpoints `/api/productions/1/picture-boats` and `/api/productions/1/security-boats` returned `[]` even though 46 boats existed in the main `boats` table.

**Root cause**: The `data_loader.py` seeded boat functions (YELLOW/RED/NEUTRAL/EXILE for picture, SAFETY/MEDICAL/EVAC etc. for security) but never copied actual boat entities into the `picture_boats` and `security_boats` tables. All 46 boats remained only in the main `boats` table.

**Fix**:
- `data_loader.py`: Added two new idempotent migration functions:
  - `_seed_picture_boat_entities(prod_id)` — copies all boats from `boats` to `picture_boats`
  - `_seed_security_boat_entities(prod_id)` — copies all boats from `boats` to `security_boats`
- Both functions are called during bootstrap (existing production path and first-time setup path)
- Added `create_picture_boat` to imports from `database.py`

**Verification**:
- `/api/productions/1/picture-boats` now returns 46 boats (was 0)
- `/api/productions/1/security-boats` now returns 46 boats (was 0)
- Main boats endpoint still returns 46 boats (no regression)
- All other API endpoints still return correct data
- App starts without errors

**Branch**: fix/2026-03-22-seed-picture-security-boats
**Side effects**: None
**Next priority**: P0 Fleet/Crew sub-tab layout shifts (sub-nav injected via prepend may cause issues); P1 Transport/Helpers/Guards data still empty (may require user to add via UI)

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
