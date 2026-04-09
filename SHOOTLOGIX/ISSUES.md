# ISSUES — ShootLogix Known Issues Log

## [FIXED] Fleet/Crew sub-tab event handlers — fixed in PR #32
- **Discovered**: 2026-03-22
- **Fixed**: 2026-03-23
- **Resolution**: Panel stacking fixed; sub-nav injection with CSS var `--subnav-bar-h` now accounts for layout shifts.

## [FIXED] Missing confirmation dialogs on assignment deletion
- **Discovered**: 2026-04-09
- **Fixed**: 2026-04-09
- **Resolution**: Added `showConfirm()` to `removeAssignmentById`, `pbRemoveAssignmentById`, `tbRemoveAssignmentById`, `sbRemoveAssignmentById` — now all 6 remove-assignment functions require user confirmation.

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [PARTIAL] Transport and Helpers lists
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09
- **Transport**: RESOLVED — 14 transport vehicles now exist in DB. `/api/productions/1/transport-vehicles` returns data. The `/api/productions/1/transport` endpoint returns transport schedules (not vehicles) which is correct.
- **Helpers**: Still empty — `/api/productions/1/helpers` returns `[]`. However, 73 helper-assignments exist (function slots without workers assigned). Users need to create helpers through the UI.
- **Files involved**: `database.py`, `data_loader.py`

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
