# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM — RESOLVED
- **Discovered**: 2026-03-22
- **Resolved**: 2026-04-09 (verified: sub-nav uses inline onclick handlers, content panels re-render each time, layout overflow fixed in 2026-03-23)
- **Status**: No longer an issue — the prepend approach works correctly with the `--subnav-bar-h` CSS variable fix

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [P1] Transport and Helpers lists are empty — PARTIALLY RESOLVED
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09
- **Status**: Transport vehicles (14) and functions (13) are now seeded by data_loader. Transport tab loads correctly. Helpers table is empty by design — 73 helper-assignment functions (roles) exist but no individual workers have been created yet. Users can add workers via the UI.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: N/A — working as designed, users create workers as needed

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

## [P1] Currency field silently ignored in create entity modals — FIXED
- **Discovered**: 2026-04-09
- **Fixed**: 2026-04-09
- **Symptoms**: All 5 create-entity modals had currency dropdown in HTML but JS never read the value. Boats/picture boats also lacked vendor field in create modal.
- **Fix**: Added currency and vendor reading to all create functions in app-monolith.js, added vendor input to boats/picture-boats HTML modals.
- **Branch**: fix/2026-04-09-currency-vendor-create-modals

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
