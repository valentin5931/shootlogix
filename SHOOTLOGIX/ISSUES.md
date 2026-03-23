# ISSUES — ShootLogix Known Issues Log

## [P1] Database integrity errors returned clean JSON (FIXED 2026-03-23)
- **Discovered**: 2026-03-23
- **Symptoms**: Creating assignments with invalid entity IDs (e.g., boat_id=9999) returned 500 Internal Server Error with full Python traceback
- **Root cause**: No global error handler for `sqlite3.IntegrityError`
- **Fix**: Added `@app.errorhandler(sqlite3.IntegrityError)` in `app.py` — returns 422/409 JSON
- **Status**: FIXED in PR fix/2026-03-23-integrity-error-handler

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-03-23 — Confirmed: `picture_boats` and `security_boats` tables are intentionally separate from `boats`. All 46 boats in `boats` table have category "picture" (from BATEAUX migration). The `picture_boats`/`security_boats` tables are for specialized sub-types that users create separately. Function groups exist (4 picture, 6 security) but no boat entities.
- **Likely cause**: By design — users need to create picture boats and security boats through the UI. The `boats` table holds the main fleet.
- **Files involved**: `database.py`, `app.py`
- **Estimated effort**: N/A — this is expected behavior, not a bug

## [P1] Transport vehicles seeded but helpers entity list empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-03-23 — Transport: 14 vehicles seeded and visible via `/transport-vehicles` (Transport tab works). Helpers: 0 entities in `helpers` table, but 73 `boat_functions` (context='labour') and 73 `helper_assignments` exist. The Labour tab schedule/budget views work, but the worker list sidebar shows "No workers".
- **Likely cause**: `_seed_helpers()` creates functions and assignments but not `helpers` entities. The helpers table is for individual worker records.
- **Files involved**: `data_loader.py`, `database.py`
- **Estimated effort**: Quick — users create workers through the UI

## [P1] Fuel entries and machinery are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/fuel-entries` returns `[]`, `/api/productions/1/fuel-machinery` returns `[]`
- **Likely cause**: No data seeded for fuel module — user adds data through UI
- **Files involved**: `database.py`
- **Estimated effort**: Quick — user needs to add data

## [P1] Guards list is empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/guards` returns `[]` but guard-posts has data
- **Likely cause**: Guards need to be created separately from guard posts
- **Files involved**: `database.py`
- **Estimated effort**: Quick — user creates guards through UI

## [P2] Fleet/Crew sub-tab event handlers — NOT a bug (downgraded)
- **Discovered**: 2026-03-22
- **Updated**: 2026-03-23 — Tested thoroughly. The `renderFleetUnified()` function uses inline onclick handlers that survive DOM movement. Sub-nav is re-rendered fresh each time. No actual bug found.
- **Status**: Downgraded from P0 to P2 (cosmetic concern only)

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
