# ISSUES — ShootLogix Known Issues Log

## [RESOLVED] [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Resolved**: 2026-04-12
- **Resolution**: The sub-nav injection approach works correctly. Layout overflow was fixed in 2026-03-23 (CSS var `--subnav-bar-h`). Event handlers fire properly because the original DOM panels are switched, not cloned. Sub-nav is moved between panels via `prepend()` which works as intended with `getElementById()`.

## [RESOLVED] [P0] Checklist tab completely broken — state.production undefined
- **Discovered**: 2026-04-12
- **Resolved**: 2026-04-12 (fix/2026-04-12-checklist-tab-broken)
- **Symptoms**: Clicking Checklist tab showed the panel but no data loaded. "Generate" button did nothing. No error displayed.
- **Root cause**: `loadChecklist()`, `generateChecklist()`, and `toggleChecklistItem()` referenced `state.production` (never set) instead of `state.prodId`.
- **Fix**: Replaced `state.production` / `state.production.id` with `state.prodId` in all 3 functions.

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [RESOLVED] [P1] Transport list is empty
- **Discovered**: 2026-03-22
- **Resolved**: 2026-04-12 (verified — transport-vehicles has 14 vehicles seeded by data_loader.py)

## [P1] Helpers list is empty (but 73 helper-assignments exist)
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-12
- **Symptoms**: `/api/productions/1/helpers` returns `[]` but `/api/productions/1/helper-assignments` has 73 entries (all with `helper_id=NULL`). The Labour tab shows assignment cards via functions but no named workers.
- **Likely cause**: Helper-assignments are function-based (linked via `boat_function_id`), not worker-based. No individual helpers have been created by users yet. This is expected behavior — users add helpers as needed.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Not a bug — data entry by users

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
