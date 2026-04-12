# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Status**: FIXED (2026-03-23) — Sub-nav layout and CSS variables corrected
- **Files involved**: `static/app-monolith.js`, `static/style.css`

## [P1] Picture Boats and Security Boats tables are empty (data design)
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-12
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All 47 boats are in the main `boats` table with `category='picture'`. Functions exist (4 picture, 6 security) but no boat entities in the specialized tables.
- **Likely cause**: The data model has 3 separate tables (`boats`, `picture_boats`, `security_boats`) but the original BATEAUX migration put all boats into `boats`. Picture and security boat tables are designed for user-created entities through the UI. The empty-state UX has been improved (2026-04-12) with onboarding CTAs.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Medium — need to clarify with production team whether some boats from main table should be migrated, or if users should add picture/security boats manually
- **Workaround**: Users can add picture/security boats through the improved empty-state "Add" buttons

## [P1] Transport and Helpers data clarification
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-12
- **Status**: PARTIALLY RESOLVED — Transport has 14 vehicles and 13 functions seeded. Helpers/Labour has 73 functions + 73 assignments. The `helpers` table (individual worker entities) is empty by design — the labour module works via `boat_functions` (context=labour) + `helper_assignments`.
- **Remaining**: Users need to add individual helper workers through the UI to assign them to functions

## [P1] Fuel entries and machinery are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/fuel-entries` returns `[]`, `/api/productions/1/fuel-machinery` returns `[]`
- **Likely cause**: No data seeded for fuel module — user needs to add data through the UI
- **Files involved**: `database.py`
- **Estimated effort**: Quick — user action needed

## [P1] Guards list is empty (by design)
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-12
- **Status**: CLARIFIED — The Guards module uses two sub-tabs: (a) Location Guards (driven by `guard_location_schedules`, 8 guard posts exist), and (b) Base Camp Guards (manual, like Labour). The `/api/productions/1/guards` endpoint returns `guard_schedules` which are empty because guard location scheduling is done via the sync mechanism. Individual guards in the `guards` table are for the camp system.

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference

## [P1] Bootstrap existing-production path was incomplete
- **Discovered**: 2026-04-12
- **Status**: FIXED — Added missing `_seed_security_boats()`, `_seed_transport()`, `_seed_helpers()` calls to existing-production bootstrap path. Also fixed `_seed_helpers()` guard to check both `'helpers'` and `'labour'` contexts.
- **Files involved**: `data_loader.py`
