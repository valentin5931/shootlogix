# ISSUES — ShootLogix Known Issues Log

## [RESOLVED 2026-04-07] [P0] Timeline tab 500 error: locations query referenced non-existent columns
- **Discovered**: 2026-04-07
- **Symptoms**: `GET /api/productions/1/timeline` returned `500 sqlite3.OperationalError: no such column: site`. Timeline tab was unusable.
- **Root cause**: `api_timeline()` queried `locations.site` (doesn't exist; should be `location_type`) and `location_schedules.prep/filming/wrap` (don't exist; the schema uses a single `status` column with `'P'`/`'F'`/`'W'`).
- **Fix**: `app.py:7892-7914` — query the actual columns and use `status` directly as the phase. Output shape preserved.
- **Branch**: fix/2026-04-07-timeline-500-locations-schema

## [RESOLVED 2026-04-01] [P0] Fleet/Crew sub-tab panel stacking
- **Resolved by**: commit 2a93828 — `renderFleetUnified`/`renderCrewUnified` now clear `active` from all related panels before activating the target, fixing visual stacking when switching Boats↔Picture Boats and Labour↔Guards.

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [P1] Transport and Helpers lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/transport` returns `[]`, `/api/productions/1/helpers` returns `[]` (but helper-assignments has data). No transport vehicles or helpers have been created.
- **Likely cause**: Data was never seeded for these modules, or they need to be created manually by users.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — may just need user to add data through the UI

## [P1] Fuel entries and machinery are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/fuel-entries` returns `[]`, `/api/productions/1/fuel-machinery` returns `[]`
- **Likely cause**: No data seeded for fuel module
- **Files involved**: `database.py`
- **Estimated effort**: Quick — user needs to add data

## [P1] Guards list is empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/guards` returns `[]` but guard-posts has data (1643 bytes)
- **Likely cause**: Guards need to be created separately from guard posts
- **Files involved**: `database.py`
- **Estimated effort**: Quick

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
