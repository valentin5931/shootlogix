# ISSUES — ShootLogix Known Issues Log

## [P1] Picture Boats and Security Boats tables are empty on fresh installs
- **Discovered**: 2026-03-22
- **Status**: Empty-state guidance added 2026-04-11 (users now see a clear CTA explaining what these tabs are and how to add items)
- **Symptoms**: `picture_boats` and `security_boats` tables contain 0 rows even though the main `boats` table has 46 rows (all with category `picture`). The `picture_boat_functions` (4) and `security_boat_functions` (6) are seeded via `data_loader._seed_picture_boats` / `_seed_security_boats` but the actual boat inventories aren't.
- **Likely cause**: The three boat tables (`boats`, `picture_boats`, `security_boats`) are independent inventories. The BATEAUX migration only populates the main `boats` table. `picture_boats` and `security_boats` are designed to be user-populated through the UI.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes), `static/app-monolith.js` (empty states)
- **Estimated effort**: Done for UX. A follow-up could auto-seed a few demo entries or add a "Copy from Boats" helper.

## [P1] Transport/helpers/fuel/guards inventories are empty on fresh installs
- **Discovered**: 2026-03-22
- **Status**: Partially outdated. `transport_vehicles` now has 14 rows (seeded by `_seed_transport` during bootstrap). The frontend reads from `/api/productions/<id>/transport-vehicles` (populated) — the `/transport` endpoint returns schedules and is unused by the SPA.
- **Symptoms**: Fresh installs show empty sidebars on Labour (helpers=0), Guards (guards=0), Fuel (fuel_entries=0, fuel_machinery=0). Users have no in-context guidance on what to do.
- **Fix 2026-04-11**: Empty-state guidance added to Labour and Guards sidebars with a primary "+ Add" CTA. Fuel tab still needs a similar treatment.
- **Files involved**: `static/app-monolith.js` (`renderLbWorkerList`, `renderGcWorkerList`), `data_loader.py`
- **Estimated effort**: Quick for fuel empty state; medium for optional seed data

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
