# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [P1] ~~Picture Boats and Security Boats lists are empty~~ FIXED 2026-04-13
- **Discovered**: 2026-03-22
- **Fixed**: 2026-04-13 — Added `PICTURE_BOAT_DATA` (8 camera boats) and `SECURITY_BOAT_DATA` (6 safety boats) to `data_loader.py`, seeded alongside functions.
- **Branch**: fix/2026-04-13-seed-picture-security-boats

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

## [P1] Picture/Security boat assignments not seeded
- **Discovered**: 2026-04-13
- **Symptoms**: Picture boats (8) and security boats (6) now exist as entities, but no assignments link them to their functions. The role cards show empty drop zones. Users must manually drag-drop boats to assign them.
- **Likely cause**: Only boat entities and functions were seeded, not the assignments connecting them. Transport similarly has 14 vehicles and 13 functions but 0 assignments.
- **Files involved**: `data_loader.py`
- **Estimated effort**: Medium — need to create default assignments linking boats to functions with date ranges

## [P1] Helpers (Labour) worker entities are empty
- **Discovered**: 2026-04-13
- **Symptoms**: `/api/productions/1/helpers` returns `[]`. The `helpers` table has 0 rows. However, 73 helper functions and 73 helper_assignments exist (with `helper_id: null`). The Labour sidebar shows "No workers".
- **Likely cause**: `_seed_helpers()` only seeds `boat_functions` (context=labour) and `helper_assignments`, but never creates `helpers` rows. The assignment system uses `helper_name_override` field as a workaround.
- **Files involved**: `data_loader.py`, `database.py`
- **Estimated effort**: Medium — need to seed helper entities or ensure the UI works with assignments that have no linked helper_id

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
