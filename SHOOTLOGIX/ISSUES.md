# ISSUES — ShootLogix Known Issues Log

## [P1] Transport assignments not seeded — schedule/budget views empty
- **Discovered**: 2026-04-03
- **Symptoms**: Transport tab shows 14 vehicles in sidebar and 13 functions in cards, but schedule and budget views are empty because no assignments link functions to vehicles.
- **Likely cause**: `_seed_transport()` creates vehicles and functions but does not create `transport_assignments` linking them (unlike boats which have full assignment data from the BATEAUX migration).
- **Files involved**: `data_loader.py` (_seed_transport), `database.py` (create_transport_assignment)
- **Estimated effort**: Medium — need to create assignment data matching each transport function to the corresponding vehicle

## [FIXED] [P1] Data seeder context mismatch in _seed_helpers
- **Discovered**: 2026-04-03
- **Fixed**: 2026-04-03 (fix/2026-04-03-seed-helpers-context-mismatch)
- **Symptoms**: Latent bug — `_seed_helpers()` used `context='helpers'` but DB migration renames to `context='labour'`. Could create 73 duplicate functions if re-run.
- **Root cause**: Seeder not updated after context rename migration. Also missing from restart path.

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

## [UPDATED] [P1] Transport vehicles exist but no assignments; Helpers table empty by design
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-03
- **Symptoms**: Transport has 14 vehicles and 13 functions but 0 assignments (schedule/budget views empty). Helpers table has 0 rows but 73 functions+assignments exist — the helpers (workers) are meant to be created by users via the UI and then assigned to functions.
- **Likely cause**: Transport seeder creates vehicles and functions but not assignments. Helpers are user-created entities.
- **Files involved**: `data_loader.py` (_seed_transport)
- **Estimated effort**: Medium for transport assignments; helpers is by design

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
