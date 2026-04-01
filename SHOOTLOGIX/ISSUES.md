# ISSUES — ShootLogix Known Issues Log

## [FIXED] Timeline API crash — no such column: site
- **Discovered**: 2026-04-01
- **Fixed**: 2026-04-01 (branch: fix/2026-04-01-timeline-api-crash)
- **Root cause**: Timeline endpoint queried non-existent `site` column (should be `location_type`) and non-existent `prep/filming/wrap` columns in location_schedules (should use `status` column). Also missing soft-delete filters on all 7 entity queries.

## [P1] _seed_helpers idempotency check uses wrong context name
- **Discovered**: 2026-04-01
- **Symptoms**: `_seed_helpers()` in `data_loader.py` checks for `boat_functions` with `context='helpers'`, but a migration renames these to `context='labour'`. If `_seed_helpers` were called on re-run, it would create 73 duplicate helper functions.
- **Likely cause**: Migration in `database.py` renames context 'helpers' → 'labour' but `_seed_helpers()` was not updated to match.
- **Files involved**: `data_loader.py` (`_seed_helpers`), `database.py` (context rename migration)
- **Estimated effort**: Quick fix — change check to `context='labour'`

## [P1] Bootstrap re-run path missing seed calls
- **Discovered**: 2026-04-01
- **Symptoms**: When the DB already exists (re-run path at `data_loader.py:288-312`), `_seed_helpers()`, `_seed_security_boats()`, and `_seed_transport()` are not called. If the DB was created before these seeds were added, they never run.
- **Likely cause**: These seed functions were added to the first-time path but not the re-run path.
- **Files involved**: `data_loader.py` (bootstrap function)
- **Estimated effort**: Quick — add the 3 missing calls to the re-run path (they're idempotent, but see P1 above about `_seed_helpers` context check first)

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

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
