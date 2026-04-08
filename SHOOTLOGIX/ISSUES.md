# ISSUES — ShootLogix Known Issues Log

## [RESOLVED 2026-04-08] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Resolved by**: PR #32 ("[P0] Fix panel stacking when switching Fleet/Crew sub-tabs", commit 2a93828) — `renderFleetUnified`/`renderCrewUnified` now clear `active` from all related panels before activating the target, and `setTab` resets `--subnav-bar-h` when leaving fleet/crew. Symptoms no longer observed during 2026-04-08 diagnostic run.

## [RESOLVED 2026-04-08] Labour tab empty — data_loader seeded wrong boat_functions.context
- **Discovered**: 2026-04-08 (diagnostic run)
- **Symptoms**: `GET /api/productions/1/boat-functions?context=labour` returned `[]` on a freshly bootstrapped DB, leaving the Crew › Labour tab with no role cards, no schedule, and no budget breakdown. `boat_functions` actually had 73 matching rows but they were stored with `context='helpers'`.
- **Root cause**: `data_loader._seed_helpers()` seeded with the legacy string `'helpers'`. `init_db()` has a `UPDATE boat_functions SET context='labour' WHERE context='helpers'` migration, but it runs BEFORE `bootstrap()`, so on a fresh DB it renames nothing and the seeder then inserts with the wrong context.
- **Fix**: `data_loader.py` `_seed_helpers` now uses `context='labour'` for both the existence check and the `create_boat_function` call. Fresh DB and legacy DB upgrade paths both verified. See CHANGELOG 2026-04-08.
- **Files involved**: `data_loader.py`

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
