# ISSUES — ShootLogix Known Issues Log

## [FIXED] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Fixed**: 2026-03-23 (panel stacking fix) + 2026-04-13 (_tabCtx + FAB + pull-to-refresh fix)
- **Resolution**: Panel stacking fixed in PR #32. Context propagation (_tabCtx, FAB, pull-to-refresh) fixed in fix/2026-04-13-fleet-crew-subtab-context branch.

## [P1] Missing confirmation dialogs for destructive delete operations
- **Discovered**: 2026-04-13
- **Symptoms**: Many delete operations (boats, assignments, functions, workers, vehicles) execute immediately without asking for user confirmation. Only some deletes have `confirm()` dialogs (documents, security boats, locations, guard posts, FNB categories/items).
- **Likely cause**: Confirm dialogs were added incrementally and many operations were missed.
- **Files involved**: `static/app-monolith.js` — removeAssignmentById (~line 2937), pbRemoveAssignmentById (~2949), deleteBoat (~2551), deleteFunction (~3176), tbRemoveAssignmentById (~6327), sbRemoveAssignmentById (~8824), guard camp assignment delete (~10773)
- **Estimated effort**: Quick — add `if (!confirm(...)) return;` before each unprotected delete

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
