# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [P1] Picture Boats and Security Boats lists are empty — ✅ FIXED 2026-04-12
- **Discovered**: 2026-03-22
- **Fixed**: 2026-04-12 — Added entity seeding in `_seed_picture_boats()` (6 picture boats) and `_seed_security_boats()` (6 security boats). Also fixed bootstrap "existing production" path to call all seed functions.
- **Branch**: fix/2026-04-12-seed-picture-security-boats

## [P1] Helpers list is empty (transport now working)
- **Discovered**: 2026-03-22 | **Updated**: 2026-04-12
- **Symptoms**: `/api/productions/1/helpers` returns `[]` but `helper-assignments` has 73 records (all with `helper_id=None`). Transport is now working (14 vehicles seeded, correct endpoint at `/api/productions/1/transport-vehicles`).
- **Likely cause**: `_seed_helpers()` creates boat_functions + helper_assignments but does NOT create records in the `helpers` table. The assignments have `helper_id=None` (unassigned slots).
- **Files involved**: `data_loader.py` (`_seed_helpers` function)
- **Estimated effort**: Medium — need to create helper entity records and optionally link them to existing assignments

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
