# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM — RESOLVED
- **Discovered**: 2026-03-22
- **Resolved**: 2026-03-23 (commit 2a93828, PR #32)
- **Fix**: Fixed panel stacking and sub-nav injection. Layout height now compensates for sub-nav via `--subnav-bar-h` CSS variable.

## [P1] Unhandled promise rejections in delete operations — RESOLVED
- **Discovered**: 2026-04-10
- **Resolved**: 2026-04-10
- **Symptoms**: 4 delete operations (transport vehicle, fuel machinery, labour worker, guard camp worker) inside showConfirm callbacks had no try/catch. Failed deletes silently removed items from UI but data persisted in DB.
- **Fix**: Added try/catch to all 4 callbacks + made `_confirmOk()` catch async errors globally.

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [P1] Helpers list is empty (Transport now has 14 vehicles)
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-10 — Transport now has 14 vehicles. Helpers still need user-created data.
- **Symptoms**: `/api/productions/1/helpers` returns `[]`. No helpers have been created.
- **Likely cause**: Data needs to be created manually by users through the UI. CRUD endpoints work correctly.
- **Files involved**: N/A — not a code bug, just no seed data
- **Estimated effort**: N/A — user action needed

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
