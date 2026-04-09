# ISSUES — ShootLogix Known Issues Log

## [P2] Audit database.py helpers for transaction visibility bugs
- **Discovered**: 2026-04-09
- **Symptoms**: `generate_daily_checklist()` was returning `null` on the first call for a new date because it called `get_daily_checklist()` (which opens a fresh connection) from inside its own uncommitted transaction, and SQLite readers on a separate connection can't see uncommitted writes. Fixed in 2026-04-09 changelog entry. Other helpers may have the same pattern.
- **Likely cause**: `with get_db() as conn:` pattern used throughout, where helpers occasionally `return other_helper(...)` instead of reading within the same `conn`.
- **Files involved**: `database.py` (grep for `return \w+(prod_id` patterns inside `with get_db` blocks).
- **Estimated effort**: Medium — requires reading every helper that calls another helper and verifying it's not still inside an open transaction.

## [RESOLVED 2026-03-23] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- Resolved by the 2026-03-23 fleet/crew sub-nav layout overflow fix (see CHANGELOG.md) and the 2a93828 panel-stacking fix.

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
