# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [P1] ~~Picture Boats and Security Boats lists are empty~~ FIXED 2026-04-04
- **Discovered**: 2026-03-22
- **Fixed**: 2026-04-04 — Added seed data for 4 picture boats + 6 security boats with assignments in `data_loader.py`
- **Branch**: fix/2026-04-04-seed-picture-security-boats

## [P1] ~~Transport list is empty~~ FIXED (already seeded)
- **Discovered**: 2026-03-22
- **Status**: Transport vehicles are seeded (14 vehicles via `_seed_transport()`). The API `/api/productions/1/transport-vehicles` returns 14 items correctly.

## [P1] Helpers (Labour) list is empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/helpers` returns `[]`. 73 helper functions exist in boat_functions with context='labour', and helper-assignments have data, but no helper entities exist.
- **Likely cause**: The seeder creates helper functions and assignments but never creates helper entities in the `helpers` table. This is the same pattern that was fixed for picture/security boats.
- **Files involved**: `data_loader.py` (`_seed_helpers()`)
- **Estimated effort**: Medium — need to create helper entities and link assignments to them

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
