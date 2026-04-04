# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM — RESOLVED
- **Discovered**: 2026-03-22
- **Resolved**: 2026-04-04 (sub-nav layout fixed in 2026-03-23; keyboard shortcut bypass fixed in 2026-04-04)
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Resolution**: Sub-nav height is now tracked via CSS var `--subnav-bar-h`. Keyboard shortcuts (4-6, 9-0) now route through unified Fleet/Crew tabs instead of bypassing them.

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

## [P1] Missing confirmation dialogs for 9 delete operations
- **Discovered**: 2026-04-04
- **Symptoms**: Deleting picture-boat assignments, transport assignments, security-boat assignments, fuel locked prices, and FnB entries has no confirmation dialog — the action executes immediately on click.
- **Likely cause**: These delete operations were added without `showConfirm()` wrappers, unlike the 33 other delete operations that do have confirmations.
- **Files involved**: `static/app-monolith.js` (lines 2170, 2949, 6327, 6712, 8824, 11539, 11567, 11581, 11588)
- **Estimated effort**: Quick fix — wrap each in `showConfirm()`

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
