# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM — RESOLVED
- **Discovered**: 2026-03-22
- **Resolved**: 2026-03-23 (layout overflow fix) + 2026-04-13 (verified working)
- **Resolution**: Event handlers work correctly — fleet/crew unified tabs switch the active view panel rather than cloning content. Layout overflow was fixed by adding `--subnav-bar-h` CSS variable.

## [P1] Picture Boats and Security Boats lists are empty — RESOLVED
- **Discovered**: 2026-03-22
- **Resolved**: 2026-04-13
- **Resolution**: Added `PICTURE_BOAT_DATA` (6 boats) and `SECURITY_BOAT_DATA` (6 boats) to `data_loader.py`. Modified `_seed_picture_boats()` and `_seed_security_boats()` to create boat entities and assignments. Also fixed `_seed_security_boats()` not being called on subsequent startups.

## [P1] Helpers list is empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-13 — Transport issue resolved (14 vehicles exist, frontend uses correct endpoint `/api/productions/1/transport-vehicles`)
- **Symptoms**: `/api/productions/1/helpers` returns `[]`. Helper functions exist (73) with helper_name_override assignments, but no actual `helpers` table entries.
- **Likely cause**: Helper functions use `helper_name_override` instead of linking to `helpers` table entities. Users can create helpers through the UI.
- **Files involved**: `data_loader.py`
- **Estimated effort**: Quick — add helper entity seeding or let users add via UI

## [P1] Fuel entries and machinery are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/fuel-entries` returns `[]`, `/api/productions/1/fuel-machinery` returns `[]`
- **Likely cause**: No data seeded for fuel module — user-created data
- **Files involved**: `database.py`
- **Estimated effort**: Quick — user needs to add data through the UI

## [P1] Guards list is empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/guards` returns `[]`, guard-posts has 8 entries. Also, `guards` table lacks `deleted_at` column (not currently causing issues since no code filters guards by deleted_at).
- **Likely cause**: Guards need to be created separately from guard posts — user-created data
- **Files involved**: `database.py`
- **Estimated effort**: Quick

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
