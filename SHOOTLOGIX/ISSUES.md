# ISSUES — ShootLogix Known Issues Log

## [FIXED] _seed_helpers idempotency check uses wrong context name
- **Discovered**: 2026-04-01
- **Fixed**: 2026-04-01 (branch: fix/2026-04-01-seed-helpers-idempotency)
- **Root cause**: `_seed_helpers()` checked `context='helpers'` but migration renames to `context='labour'`. Also `_seed_helpers`, `_seed_security_boats`, `_seed_transport` were missing from the re-run bootstrap path.
- **Fix**: Changed idempotency check and seed context to `context='labour'`, added 3 missing seed calls to re-run path.

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [P1] Picture Boats and Security Boats entity lists are empty
- **Discovered**: 2026-03-22, updated 2026-04-01
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`.
- **Likely cause**: Seed functions only create boat_functions (roles), not actual entity records in picture_boats/security_boats tables. Users need to create these via the UI, or additional seed data is needed.
- **Files involved**: `data_loader.py`, `database.py`
- **Estimated effort**: Medium — need entity seeding or user data entry

## [P1] Helpers entity list is empty
- **Discovered**: 2026-04-01
- **Symptoms**: `/api/productions/1/helpers` returns `[]` even though 73 helper functions are seeded.
- **Likely cause**: `_seed_helpers()` creates boat_functions and helper_assignments but no `helpers` entity records.
- **Files involved**: `data_loader.py` (`_seed_helpers`)
- **Estimated effort**: Medium

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
