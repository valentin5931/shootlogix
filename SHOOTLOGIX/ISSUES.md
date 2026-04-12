# ISSUES — ShootLogix Known Issues Log

## [P0] ~~Fleet/Crew sub-tab event handlers may not fire on cloned DOM~~ RESOLVED
- **Discovered**: 2026-03-22
- **Resolved**: 2026-03-23 (layout fix) + 2026-04-12 (no actual handler bug — event handlers use global onclick, no cloning)
- **Status**: CLOSED — Sub-nav layout fixed via `--subnav-bar-h` CSS var. Event handlers work correctly.

## [P0] State variable naming mismatches in _findAssignment and _reloadCurrentTab — FIXED 2026-04-12
- **Discovered**: 2026-04-12
- **Symptoms**: Day-override edits (schedule grid cell changes) silently failed for Picture Boats, Security Boats, and Labour. Pull-to-refresh on Picture Boats tab didn't update the display.
- **Root cause**: `_findAssignment()` used `state.pbAssignments`/`state.sbAssignments`/`state.helperAssignments` (nonexistent) instead of `state.pictureAssignments`/`state.securityAssignments`/`state.labourAssignments`. Same pattern in `_reloadCurrentTab()` for picture boats.
- **Fix**: Corrected variable names in both functions.
- **Status**: FIXED in branch `fix/2026-04-12-state-variable-naming-mismatch`

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [P1] Helpers (Labour) entity list is empty — PARTIALLY RESOLVED
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-12
- **Symptoms**: `/api/productions/1/helpers` returns `[]` (but 73 helper-assignments and 73 labour functions exist). Transport is now resolved — 14 transport vehicles are seeded and API returns them correctly.
- **Likely cause**: No helper entities have been created; only functions and blank assignments were seeded. Users need to add worker entities through the UI.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — user needs to add worker data through the Labour tab

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
